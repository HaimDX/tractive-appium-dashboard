import React from "react";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Route,
  Router,
  Switch,
  useHistory,
  useLocation,
} from "react-router-dom";
import {
  getBuildDetailsUrl,
  getSessionDetailsUrl
} from "../../constants/routes";
import { APP_HEADER_HEIGHT } from "../../constants/ui";
import {
  fetchSessionInit,
  setSelectedSession
} from "../../store/actions/session-actions";
import { getSessions } from "../../store/selectors/entities/sessions-selector";
import ParallelLayout, { Column } from "../UI/layouts/parallel-layout";
import SerialLayout, { Row } from "../UI/layouts/serial-layout";
import AppHeader from "../UI/organisms/app-header";
import SessionDetails from "../UI/organisms/session/session-details";
import SessionList from "../UI/organisms/session/session-list";
import BuildList from "../UI/organisms/build/build-list";
import { getBuilds } from "../../store/selectors/entities/builds-selector";
import { setSelectedBuild } from "../../store/actions/build-actions";
import { extractBuildIdFromUrl } from "../../utils/utility";
import { RootState } from "../../store";
import Session from "../../interfaces/session";
import { Header } from "../UI/organisms/header/header";

function extractSessionidFromUrl(url: string): string | null {
  const matches = url.match(new RegExp(/dashboard\/session\/(.*)/));
  return matches?.length ? matches[1] : null;
}

export default function DashboardTemplate() {
  const history = useHistory();
  const dispatch = useDispatch();
  const location = useLocation();
  const sessions = useSelector(getSessions);
  const session_id = extractSessionidFromUrl(location.pathname);

  const builds = useSelector(getBuilds);
  const buildIdFromUrl = extractBuildIdFromUrl(location.pathname);

  useEffect(() => {
    if (!session_id) return;

    const matchedSession = sessions.find((s) => s.session_id === session_id);

    if (matchedSession) {
      dispatch(setSelectedSession(matchedSession));
    } else {
      // Session isn't loaded yet — fetch it by ID
      dispatch(fetchSessionInit(session_id));
    }
  }, [session_id, sessions]);

  //session now exists
  const selectedSession = useSelector((state:RootState) =>
    state.entities.sessions.items.find((s:Session) => s.session_id === session_id)
  );

  useEffect(() => {
    if (selectedSession) {
      dispatch(setSelectedSession(selectedSession));

      if (selectedSession.build_id) {
        const matchingBuild = builds.find(
          (b) => b.build_id === selectedSession.build_id
        );

        if (matchingBuild) {
          dispatch(setSelectedBuild(matchingBuild));
        } else {
          // Optional: trigger fetch build by ID if needed
          // dispatch(fetchBuildInit(selectedSession.build_id));
        }
      }
    }
  }, [selectedSession, builds]);


  useEffect(() => {
    // Only update builds selection if we are on a build page
    if (!location.pathname.includes("/session/")) {
      const selectedBuild = !!buildIdFromUrl
        ? builds.find((d) => d.build_id === buildIdFromUrl) || builds[0]
        : builds[0];

      if (selectedBuild) {
        const sessionsUrl = getBuildDetailsUrl(selectedBuild.build_id);

        if (
          buildIdFromUrl &&
          (buildIdFromUrl !== selectedBuild.build_id ||
            !location.pathname.includes("/sessions"))
        ) {
          // Always redirect to /builds/:id/sessions explicitly
          history.push(sessionsUrl);
        }

        dispatch(setSelectedBuild(selectedBuild));
      }
    }
  }, [buildIdFromUrl, builds, location.pathname]);

  return (
    <>
    <SerialLayout>
      <Row height={`${APP_HEADER_HEIGHT}px`}>
        <Header/>
      </Row>
      <Row height={`calc(100vh - ${APP_HEADER_HEIGHT}px)`}>
        <ParallelLayout>
          {/** Build List View **/}
          <Column grid={2.5}>
            <BuildList />
          </Column>
          {/** End Build List View **/}


          {/** Sessions List View **/}
          <Column grid={2.5}>
            <SessionList />
          </Column>
          {/** End Session List View **/}


          {/** Session Details View **/}
          <Column grid={7.5}>
            <Router history={history}>
              <Switch>
                <Route>
                  <SessionDetails />
                </Route>
              </Switch>
            </Router>
          </Column>
          {/** End Session Details View **/}


        </ParallelLayout>
      </Row>
    </SerialLayout>
    </>
  );
}
