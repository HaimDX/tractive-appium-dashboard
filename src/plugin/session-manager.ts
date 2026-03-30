import * as path from "path";
import _ from "lodash";
import { SessionInfo } from "../interfaces/session-info";
import { AppiumCommand } from "../interfaces/appium-command";
import {
  interceptProxyResponse,
  routeToCommand,
  isDashboardCommand,
  getHttpLogger,
  isAppProfilingSupported,
  isHttpLogsSuppoted,
  isAndroidSession,
  getMjpegServerPort, getAppVersion
} from "./utils/plugin-utils";
import {
  getLogs,
  startScreenRecording,
  stopScreenRecording,
  takeScreenShot,
  terminateSession,
} from "./driver-command-executor";
import { CommandParser } from "./command-parser";
import { CommandLogs as commandLogsModel, Session, Logs as LogsTable, Profiling } from "../models";
import { Op } from "sequelize";
import { logger } from "../loggers/logger";
import { pluginLogger } from "../loggers/plugin-logger";
import * as fs from "fs";
import "reflect-metadata";
import { Container } from "typedi";
import { v4 as uuidv4 } from "uuid";
import { DashboardCommands } from "./dashboard-commands";
import { PluginCliArgs } from "../interfaces/PluginCliArgs";
import { SessionTimeoutTracker } from "./session-timeout-tracker";
import { getOrCreateNewBuild, getOrCreateNewProject } from "../database-service";
import sessionDebugMap from "./session-debug-map";
import { AndroidAppProfiler } from "./app-profiler/android-app-profiler";
import EventEmitter from "events";
import { IHttpLogger } from "./interfaces/http-logger";
import { HttpLogs } from "../models/http-logs";
import { DriverScriptExecutor } from "./script-executor/executor";

const CREATE_SESSION = "createSession";


class SessionManager {
  private lastLogLine = 0;
  private config: any = Container.get("config");
  private dashboardCommands: DashboardCommands;
  private sessionTimeoutTracker: SessionTimeoutTracker;
  private debugEventNotifier: EventEmitter;
  private driver: any;
  private sessionInfo: SessionInfo;
  private commandParser: CommandParser;
  private sessionResponse: any;
  private cliArgs: PluginCliArgs;
  private adb: any;
  private appProfiler!: AndroidAppProfiler;
  private httpLogger!: IHttpLogger;
  private httpLogsAvailable: boolean = false;
  private driverScriptExecutor!: DriverScriptExecutor;

  constructor(opts: {
    sessionInfo: SessionInfo;
    commandParser: CommandParser;
    sessionResponse: any;
    cliArgs: PluginCliArgs;
    adb?: any;
  }) {
    this.sessionInfo = opts.sessionInfo;
    this.commandParser = opts.commandParser;
    this.cliArgs = opts.cliArgs;
    this.adb = opts.adb;

    logger.info(`new command timeout ${this.sessionInfo.capabilities.newCommandTimeout}`);
    this.sessionInfo.is_completed = false;
    this.dashboardCommands = new DashboardCommands(this.sessionInfo);
    this.sessionTimeoutTracker = new SessionTimeoutTracker({
      timeout: this.sessionInfo.capabilities.newCommandTimeout || 300, //defaults to 5 minutes
      pollingInterval: 1000, //1 seconds
      timeoutCallback: this.onSessionTimeOut.bind(this),
    });
    this.debugEventNotifier = Container.get("debugEventEmitter");
    this.resgisterEventListeners(this.debugEventNotifier);

    /* Check if the current session supports app profiling */
    if (isAppProfilingSupported(this.sessionInfo) && this.adb) {
      pluginLogger.info("Adb found. Creating device profiler");
      this.appProfiler = new AndroidAppProfiler({
        adb: this.adb.executable,
        deviceUDID: this.sessionInfo.udid,
        appPackage: this.sessionInfo.capabilities["appPackage"],
      });
    }
  }

  public resgisterEventListeners(notifier: EventEmitter) {
    let output = "";
    notifier.on(`${this.sessionInfo.session_id}`, async (data) => {
      try {
        switch (data.event) {
          case "change_state":
            sessionDebugMap.set(this.sessionInfo.session_id, {
              is_paused: data.state == "pause",
            });
            await Session.update(
              {
                is_paused: data.state == "pause",
              },
              {
                where: {
                  session_id: this.sessionInfo.session_id,
                },
              }
            );
            break;
          case "execute_driver_script":
            if (this.driverScriptExecutor) {
              output = await this.driverScriptExecutor.execute({
                script: data.script,
                timeoutMs: data.timeout,
              });
            }
            break;
        }
      } catch (err: any) {
        output = err;
      }
      this.sessionTimeoutTracker.tick();
      if (data.callback && _.isFunction(data.callback)) {
        data.callback(output);
      }
    });
  }

  public async onCommandRecieved(command: AppiumCommand): Promise<any> {
    if (command.commandName == CREATE_SESSION) {
      this.driver = command.driver;
      this.sessionTimeoutTracker.start();
      this.sessionTimeoutTracker.tick();
      return await this.sessionStarted(command);
    } else if (command.commandName == "deleteSession") {
      this.sessionTimeoutTracker.stop();
      await this.sessionTerminated();
    } else if (command.commandName == "execute" && isDashboardCommand(this.dashboardCommands, command.args[0])) {
      pluginLogger.info(`Command ${command.args[0]} can be handled by Tractive dashboard for session ${this.sessionInfo.session_id}`);
      await this.executeCommand(command);
      return true;
    } else if (command.commandName == "proxyReqRes") {
      let promise = interceptProxyResponse(command.args[1]);
      let originalNext = command.next;
      command.next = async () => (await Promise.all([originalNext(), promise]))[1];
      Object.assign(command, {
        ...routeToCommand(command.args),
      });
      logger.info(`Recieved proxyReqRes command for ${command.commandName}`);
    }

    this.sessionTimeoutTracker.tick();

    logger.info(`New command recieved ${command.commandName} for session ${this.sessionInfo.session_id}`);
    await this.saveServerLogs(command);
    try {
      command.startTime = new Date();
      let res = await command.next();
      logger.info(`Recieved response for command ${command.commandName} for session ${this.sessionInfo.session_id}`);
      command.endTime = new Date();

      await this.postCommandExecuted(command, res);

      return res;
    } catch (err: any) {
      command.endTime = new Date();
      await this.saveCommandLog(command, {
        error: err.error,
        message: err.message,
      });
      logger.error(
        `Error occured while executing ${command.commandName} command ` +
          JSON.stringify({
            error: err.error,
            message: err.message,
          })
      );
      throw err;
    }
  }

  private async postCommandExecuted(command: AppiumCommand, response: any) {
    /* If the context is changed the webview, start http logging */
    if (
      !response?.error &&
      isAndroidSession(this.sessionInfo) &&
      command.commandName == "setContext" &&
      command.args[0].includes("WEBVIEW")
    ) {
      try {
        await this.httpLogger?.stop();
        this.httpLogger = getHttpLogger({
          sessionInfo: this.sessionInfo,
          adb: this.adb,
          driver: this.driver,
          isWebView: true,
          webviewName: command.args[0],
        });
        await this.httpLogger.start();
        this.httpLogsAvailable = true;
      } catch (err) {
        this.httpLogsAvailable = false;
      }
    }
    await this.saveCommandLog(command, response);
  }

  private async sessionStarted(command: AppiumCommand) {
    try {
      sessionDebugMap.createNewSession(this.sessionInfo.session_id);

      this.driverScriptExecutor = new DriverScriptExecutor(this.sessionInfo, command.driver);

      /* Check if the current session supports network profiling */
      if (isHttpLogsSuppoted(this.sessionInfo)) {
        pluginLogger.info("Creating network profiler");
        this.httpLogger = getHttpLogger({
          sessionInfo: this.sessionInfo,
          adb: this.adb,
          driver: command.driver,
        });
      }

      let { desired } = this.sessionInfo.capabilities;
      let buildName = desired["dashboard:build"];
      let projectName = desired["dashboard:project"];
      let name = desired["dashboard:name"];
      let build, project;

      /**
       *
       *
       *
       * Custom TRACTIVE Caps
       *
       *
       * */
      let user = desired["dashboard:tractive-user"];

      let { is_profiling_available, device_info } = await this.startAppProfiling();
      await this.startHttpLogsCapture();

      /* Add app version (and build number for ios) */
      let appVersion;
      try {
        appVersion = await getAppVersion(this.sessionInfo.platform_name);
        pluginLogger.info("App under test version is " + appVersion);
      }catch (error){
        pluginLogger.error("Could not determine app under test version");
      }



      /* Build & Project Tractive Caps */
      if (projectName) {
        project = await getOrCreateNewProject({ projectName });
      }
      if (buildName) {
        build = await getOrCreateNewBuild(
          {
            buildName,
            projectId: project?.id ,
            user : user || 'unknown user',
            platformName : this.sessionInfo.platform_name || 'unknown platform',
            appVersion : appVersion || 'unknown version',
          });
      }

      /**
       *
       *
       *
       * END Custom TRACTIVE Caps
       *
       *
       * */

      await this.initializeScreenShotFolder();
      await this.startScreenRecording(command.driver);
      await Session.create({
        ...this.sessionInfo,
        start_time: new Date(),
        build_id: build?.build_id,
        project_id: project?.id || null,
        device_info,
        is_profiling_available,
        name: name || null,
        live_stream_port: await getMjpegServerPort(command.driver, this.sessionInfo.session_id),
        user : user,
        app_version : appVersion,
      } as any);

      await this.saveCommandLog(command, null);
      logger.info(`Created a session  ${this.sessionInfo.session_id} for user ${user} `);
    } catch (err) {
      logger.error(
        `Error saving new session info in database for session ${
          this.sessionInfo.session_id
        }. response: ${JSON.stringify(err)}`
      );
    }
  }

  public async sessionTerminated(options: { sessionTimedOut: boolean } = { sessionTimedOut: false }) {
    await this.saveAppProfilingData();
    await this.saveHttpLogs();

    let session = await Session.findOne({
      where: {
        session_id: this.sessionInfo.session_id,
      },
    });

    if (session?.session_status?.toLowerCase() == "timeout") {
      logger.info(`Session ${this.sessionInfo.session_id} already timed out. So ignoring sessionTerminated command`);
      return;
    }

    this.sessionInfo.is_completed = true;
    let videoPath = await this.saveScreenRecording(this.driver);
    let errorCount = await commandLogsModel.count({
      where: {
        session_id: this.sessionInfo.session_id,
        is_error: true,
        command_name: {
          [Op.notIn]: ["findElement", "elementDisplayed"],
        },
      },
    });

    let updateObject: Partial<Session> = {
      is_completed: true,
      is_paused: false,
      end_time: new Date(),
      video_path: videoPath || null,
      is_http_logs_available: this.httpLogsAvailable,
    };

    if (session?.session_status?.toLowerCase() == "running") {
      updateObject.session_status = options.sessionTimedOut ? "TIMEOUT" : errorCount > 0 ? "FAILED" : "PASSED";
    }

    if (session?.is_test_passed == null) {
      updateObject.is_test_passed = options.sessionTimedOut || errorCount > 0 ? false : true;
    }

    await Session.update(updateObject, {
      where: {
        session_id: this.sessionInfo.session_id,
      },
    });
    logger.info(`Session terminated ${this.sessionInfo.session_id}`);
  }

  private async saveServerLogs(command: AppiumCommand) {
    let logs = getLogs(command.driver, this.sessionInfo.session_id, "server");
    let newLogs = logs.slice(this.lastLogLine);
    if (!newLogs.length) {
      return false;
    }
    this.lastLogLine = logs.length;
    await LogsTable.bulkCreate(
      newLogs.map((l: any) => {
        return {
          ...l,
          timestamp: new Date(l.timestamp),
          session_id: this.sessionInfo.session_id,
          log_type: "DEVICE",
        };
      })
    );

    return true;
  }

  /*
    Save command logs to a database.
     1. Parse the command log using the commandParser
     2. Save the parsed log to a database
     Note: For get page source command, we are not saving the whole result for efficiency reasons
   */
  private async saveCommandLog(command: AppiumCommand, response: any) {
    try {
      if (typeof this.commandParser[command.commandName as keyof CommandParser] == "function") {
        response = command.commandName == CREATE_SESSION ? this.sessionInfo : response;
        let parsedLog: any = await this.commandParser[command.commandName as keyof CommandParser](
          command.driver,
          command.args,
          response
        );
        let screenShotPath = null;

        //decide if the command needs a screenshot
        if (this.config.takeScreenshotsFor.indexOf(command.commandName) >= 0) {
          let screenShotbase64 = await takeScreenShot(command.driver, this.sessionInfo.session_id);
          if (screenShotbase64.value && typeof screenShotbase64.value === "string") {
            screenShotPath = path.join(this.config.screenshotSavePath, this.sessionInfo.session_id, `${uuidv4()}.jpg`);
            fs.writeFileSync(screenShotPath, screenShotbase64.value, "base64");
            logger.info(
              `Screen shot saved for ${command.commandName} command in session ${this.sessionInfo.session_id}`
            );
          } else {
            logger.error(
              `Screen shot not saved for ${command.commandName} command in session ${
                this.sessionInfo.session_id
              } .response ${JSON.stringify(screenShotbase64.value)}`
            );
          }
        }
        Object.assign(parsedLog, {
          session_id: this.sessionInfo.session_id,
          command_name: command.commandName,
          is_error: response && !!response.error ? true : false,
          screen_shot: screenShotPath,
          start_time: command.startTime,
          end_time: command.endTime,
        });

        //trim response for heavy response commands like getPageSource
        logger.info(`Deciding if we need to trim response for command for ${command.commandName} command in session ${this.sessionInfo.session_id}`);
        if( this.config.dontSaveResponseForCommands.includes(command.commandName)){
          logger.info(`Trimming response for command for ${command.commandName} command in session ${this.sessionInfo.session_id}`);
          parsedLog.response = JSON.stringify({
            type: "string",
            value: `[TRIMMED] ${command.commandName} response is too large; see raw logs`,
          });
        }

        await commandLogsModel.create(parsedLog as any);
      }
    } catch (err) {
      logger.error(err);
    }
  }

  private async startScreenRecording(driver: any) {
    let { desired } = this.sessionInfo.capabilities;
    let videoResolution = desired["dashboard:videoResolution"];
    let sholdRecordVideo = _.isNil(desired["dashboard:enableVideoRecording"])
      ? true
      : desired["dashboard:enableVideoRecording"];
    if (sholdRecordVideo) {
      await startScreenRecording(driver, this.sessionInfo.session_id, videoResolution);
    }
  }

  private async initializeScreenShotFolder() {
    let dirPath = path.join(this.config.screenshotSavePath, this.sessionInfo.session_id);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private async saveScreenRecording(driver: any) {
    try {
      let videoBase64String = await stopScreenRecording(driver, this.sessionInfo.session_id);
      if (videoBase64String.value != "" && typeof videoBase64String.value === "string") {
        let outPath = path.join(this.config.videoSavePath, `${this.sessionInfo.session_id}.mp4`);
        fs.writeFileSync(outPath, videoBase64String.value, "base64");
        logger.info(`Video saved for ${this.sessionInfo.session_id} in ${outPath}`);
        return outPath;
      } else {
        logger.error(
          `Video not saved for session ${this.sessionInfo.session_id}. response: ${JSON.stringify(
            videoBase64String.value
          )}`
        );
      }
    } catch (err) {
      logger.error(err);
    }
  }

  // private async executeCommand(command: AppiumCommand) {
  //   let scriptName = command.args[0].split(":")[1].trim();
  //   pluginLogger.info(`Executing ${scriptName} command for session ${this.sessionInfo.session_id}`);
  //   await (this.dashboardCommands[scriptName as keyof DashboardCommands] as any)(command.args[1]);
  // }

  private async executeCommand(command: AppiumCommand) {
    const scriptName = command.args[0].split(":")[1].trim();
    const fn = this.dashboardCommands[scriptName as keyof DashboardCommands];

    // Pre-execution logging
    pluginLogger.info(
      `Attempting to execute dashboard command '${scriptName}' for session ${this.sessionInfo.session_id}`
    );

    if (typeof fn === "function") {
      pluginLogger.info(
        `Found function '${scriptName}' on DashboardCommands. Executing now...`
      );
      try {
        await fn.call(this.dashboardCommands, command.args[1]);
        pluginLogger.info(
          `Successfully executed dashboard command '${scriptName}' for session ${this.sessionInfo.session_id}`
        );
      } catch (err: any) {
        pluginLogger.error(
          `Error while executing dashboard command '${scriptName}' for session ${this.sessionInfo.session_id}: ${err.message}`
        );
        pluginLogger.error(err.stack);
      }
    } else {
      pluginLogger.warn(
        `⚠️ Dashboard command '${scriptName}' not found or not a function on DashboardCommands. Type was: ${typeof fn}`
      );
      pluginLogger.warn(
        `Available keys on DashboardCommands: ${Object.keys(
          this.dashboardCommands
        ).join(", ")}`
      );
    }
  }


  private async onSessionTimeOut(timeoutValue: number) {
    logger.warn(`Session ${this.sessionInfo.session_id} timed out after ${timeoutValue} seconds`);
    await this.saveCommandLog(
      {
        driver: this.driver,
        startTime: new Date(),
        endTime: new Date(),
        commandName: "sessionTimedout",
        args: [timeoutValue],
        next: async () => {},
      },
      {}
    );
    await this.sessionTerminated({ sessionTimedOut: true });
    await terminateSession(this.driver, this.sessionInfo.session_id);
  }

  private async startAppProfiling() {
    if (this.appProfiler) {
      try {
        let device_info = await this.appProfiler?.getDeviceInfo();
        await this.appProfiler?.startCapture();
        return {
          device_info,
          is_profiling_available: true,
        };
      } catch (err) {
        pluginLogger.error("Error initializing app profiler");
        pluginLogger.error(err);
        return {
          is_profiling_available: false,
        };
      }
    } else {
      return {
        is_profiling_available: false,
      };
    }
  }

  private async saveAppProfilingData() {
    if (this.appProfiler) {
      await this.appProfiler?.stopCapture();
      let data = this.appProfiler?.getLogs() || [];
      data = data.map((d) => {
        return {
          ...d,
          session_id: this.sessionInfo.session_id,
        };
      });
      await Profiling.bulkCreate(data);
    }
  }

  private async startHttpLogsCapture() {
    if (this.httpLogger) {
      try {
        await this.httpLogger.start();
        this.httpLogsAvailable = true;
      } catch (err) {
        pluginLogger.error("Error initializing network profiler");
        pluginLogger.error(err);
        this.httpLogsAvailable = false;
      }
    } else {
      this.httpLogsAvailable = false;
    }
  }

  private async saveHttpLogs() {
    if (this.httpLogger) {
      try {
        await this.httpLogger.stop();
        let logs = this.httpLogger?.getLogs() || [];
        let data = logs.map((l) => {
          return {
            ...l,
            session_id: this.sessionInfo.session_id,
          };
        });
        await HttpLogs.bulkCreate(data, {
          validate: false,
        });
      } catch (err) {
        pluginLogger.error("Unable to save http logs in database");
        pluginLogger.error(err);
      }
    }
  }
}

export { SessionManager };
