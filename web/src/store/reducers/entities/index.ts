import { combineReducers } from "@reduxjs/toolkit";
import SessionsReducer, { SessionEntityType } from "./sessions-reducer";
import LogsReducer, { LogsState } from "./logs-reducer";
import BuildsReducer, { BuildEntityType } from "./builds-reducer";
import MetricsReducer, { MetricsEntityType } from "./metrics-reducer";

export type ListEntityType<T> = {
  count: number;
  items: Array<T>;
  isLoading: boolean;
};

export type EntitiesState = {
  sessions: SessionEntityType;
  builds: BuildEntityType;
  logs: LogsState;
  metrics: MetricsEntityType;
};

export default combineReducers({
  sessions: SessionsReducer,
  builds: BuildsReducer,
  logs: LogsReducer,
  metrics: MetricsReducer,
});
