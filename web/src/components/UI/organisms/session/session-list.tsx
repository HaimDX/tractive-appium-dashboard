import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import {
  getIsSessionsLoading,
  getSelectedSession,
  getSessions,
} from "../../../../store/selectors/entities/sessions-selector";
import {
  fetchSessionByBuildId,
  setSessionFilter,
} from "../../../../store/actions/session-actions";
import SessionCard from "./session-card";
import SessionListFilter from "./session-list-filter";
import Spinner from "../../atoms/spinner";
import Icon, { Sizes } from "../../atoms/icon";
import EmptyMessage from "../../molecules/empty-message";
import Dropdown from "../../atoms/dropdown";
import SerialLayout, { Row } from "../../layouts/serial-layout";
import ParallelLayout, { Column } from "../../layouts/parallel-layout";
import { extractBuildIdFromUrl } from "../../../../utils/utility";
import { getHeaderStyle } from "../../../../utils/ui";
import { Badge } from "@material-ui/core";
import { getSessionFilterCount } from "../../../../store/selectors/ui/filter-selector";
import {
  APP_HEADER_HEIGHT,
  SUB_APP_HEADER_HEIGHT,
} from "../../../../constants/ui";
import Utils from "../../../../utils/common-utils";
import Session from "../../../../interfaces/session";

const Container = styled.div`
    border-right: 1px solid ${(props) => props.theme.colors.border};
    width: 100%;
`;

const List = styled.div``;

const Header = styled.div`
    ${(props) => getHeaderStyle(props.theme)};
    padding: 7px 5px;
`;

const FilterTrigger = styled.div`
    padding: 10px;
`;

const FilterTriggerLabel = styled.div`
    display: inline-block;
    font-size: 13px;
    padding-left: 4px;
`;

const FilterDropdown = styled.div``;

const StyledBadge = styled(Badge)`
    position: relative;
    left: 17px;
    top: -2px;
`;

function getFiltersFromQueryParams(searchQuery: string) {
  const urlParams = new URLSearchParams(searchQuery);

  const allowedFilters: any = {
    name: "",
    os: {
      valid: ["ios", "android"],
    },
    status: {
      valid: ["running", "failed", "passed", "timeout"],
    },
    device_udid: "",
    start_time: {
      valid: (dateString: string) => {
        return !isNaN(new Date(dateString).getDate());
      },
    },
  };

  return Utils.parseJsonSchema(
    allowedFilters,
    Utils.urlParamsToObject(urlParams),
  );
}

export default function SessionList() {
  const dispatch = useDispatch();
  const sessions = useSelector(getSessions);
  const isLoading = useSelector(getIsSessionsLoading);
  const selectedSession = useSelector(getSelectedSession);
  const urlFilters = getFiltersFromQueryParams(window.location.search);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterCount = useSelector(getSessionFilterCount);
  const [effectiveBuildId, setEffectiveBuildId] = useState<string | undefined>();

  const rawBuildId = extractBuildIdFromUrl(location.pathname);

  const stableUrlFilters = useMemo(() => {
    return getFiltersFromQueryParams(window.location.search);
  }, [window.location.search]);

  // 1. Set buildId from URL if available
  useEffect(() => {
    if (rawBuildId) {
      setEffectiveBuildId(rawBuildId);
    }
  }, [rawBuildId]);

  // 2. Fallback to the selected session's buildId if on a session URL
  useEffect(() => {
    if (!rawBuildId && selectedSession?.build_id) {
      setEffectiveBuildId(selectedSession.build_id);
    }
  }, [rawBuildId, selectedSession]);


  // 3. Fetch sessions once effectiveBuildId is known
  useEffect(() => {
    if (!effectiveBuildId) return;

    if (Object.keys(stableUrlFilters).length > 0) {
      dispatch(fetchSessionByBuildId({ buildId: effectiveBuildId, ...stableUrlFilters }));
      dispatch(setSessionFilter({ buildId: effectiveBuildId, ...stableUrlFilters }));
    } else {
      dispatch(fetchSessionByBuildId(effectiveBuildId));
    }
  }, [effectiveBuildId, stableUrlFilters, dispatch]);

  // 4. When filters are applied from UI
  const setFilter = useCallback((payload) => {
    if (!effectiveBuildId) return;

    const finalPayload = {
      ...payload,
      buildId: effectiveBuildId,
    };

    console.log("fetching sessions from 4", effectiveBuildId);
    dispatch(setSessionFilter(finalPayload));
    dispatch(fetchSessionByBuildId(finalPayload));
  }, [effectiveBuildId, dispatch]);

  // 5. Manually filter only sessions for the current build
  const filteredSessions = sessions.filter(
    (session: Session) => session.build_id === effectiveBuildId,
  );

  return (
    <Container>
      <SerialLayout>
        <Row height={`${SUB_APP_HEADER_HEIGHT}px`}>
          <Header>
            <ParallelLayout>
              <Column grid={10}>
                <Dropdown
                  controlled
                  onOpen={() => setIsFilterOpen(true)}
                  onClose={() => setIsFilterOpen(false)}
                  open={isFilterOpen}
                >
                  <FilterTrigger>
                    <Icon name="filter" size={Sizes.S} />
                    <FilterTriggerLabel>FILTERS</FilterTriggerLabel>
                    <StyledBadge badgeContent={filterCount} color="secondary" />
                  </FilterTrigger>
                  <FilterDropdown>
                    <SessionListFilter
                      platform={filteredSessions[0]?.platform_name?.toLowerCase()}
                      onApply={(payload) => {
                        setFilter(payload);
                        setIsFilterOpen(false);
                      }}
                    />
                  </FilterDropdown>
                </Dropdown>
              </Column>
              {isLoading ? (
                <Column grid={2}>
                  <Spinner />
                </Column>
              ) : null}
            </ParallelLayout>
          </Header>
        </Row>
        <Row
          height={`calc(100vh - ${SUB_APP_HEADER_HEIGHT + APP_HEADER_HEIGHT}px)`}
          scrollable
        >
          <List>
            {filteredSessions.length > 0 ? (
              filteredSessions.map((session: Session) => (
                <SessionCard
                  key={session.session_id}
                  selected={selectedSession?.session_id === session.session_id}
                  session={session}
                />
              ))
            ) : (
              <EmptyMessage>No sessions found for given filter.</EmptyMessage>
            )}
          </List>
        </Row>
      </SerialLayout>
    </Container>
  );
}