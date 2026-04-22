import React, { useState } from "react";
import styled from "styled-components";
import EmptyMessage from "../../molecules/empty-message";
import SerialLayout, { Row } from "../../layouts/serial-layout";
import { useDispatch, useSelector } from "react-redux";

import { useCallback } from "react";
import { useEffect } from "react";
import {
  APP_HEADER_HEIGHT,
  SUB_APP_HEADER_HEIGHT,
} from "../../../../constants/ui";
import { getHeaderStyle } from "../../../../utils/ui";
import Utils from "../../../../utils/common-utils";
import {
  addPollingTask,
  removePollingTask,
} from "../../../../store/actions/polling-actions";
import {
  getBuilds, getSelectedBuild
} from "../../../../store/selectors/entities/builds-selector";
import {
  fetchBuildInit,
  setBuildFilter
} from "../../../../store/actions/build-actions";
import Build from "../../../../interfaces/build";
import BuildCard from "./build-card";
import ParallelLayout, { Column } from "../../layouts/parallel-layout";
import Dropdown from "../../atoms/dropdown";
import Icon, { Sizes } from "../../atoms/icon";
import Spinner from "../../atoms/spinner";
import {
  getBuildFilterCount
} from "../../../../store/selectors/ui/filter-selector";
import { Badge } from "@material-ui/core";
import {
  getIsSessionsLoading
} from "../../../../store/selectors/entities/sessions-selector";
import BuildListFilter from "./build-list-filter";

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
  positive: relative;
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

export default function BuildList() {
  const dispatch = useDispatch();
  const builds = useSelector(getBuilds);
  const urlFilters = getFiltersFromQueryParams(window.location.search);
  const selectedBuild = useSelector(getSelectedBuild);


  useEffect(() => {
    if (Object.keys(urlFilters).length) {
      setFilter(urlFilters);
    } else {
      dispatch(fetchBuildInit());
    }
  }, []);



  useEffect(() => {
    if (!selectedBuild) {
      dispatch(fetchBuildInit());
    }
  }, [selectedBuild]);


  /** Add polling for builds **/
  useEffect(() => {
    dispatch(addPollingTask(fetchBuildInit()));

    return () => {
      dispatch(removePollingTask(fetchBuildInit()));
    };
  }, []);

  /**
   * Filters
   */
  const isLoading = useSelector(getIsSessionsLoading);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterCount = useSelector(getBuildFilterCount);

  const setFilter = useCallback((payload) => {
    dispatch(setBuildFilter(payload));

    /* Reset filters polling with newly applied filters */
    dispatch(removePollingTask(fetchBuildInit()));
    dispatch(addPollingTask(fetchBuildInit(payload)));
  }, []);

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
                    <BuildListFilter
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
          height={`calc(100vh - ${
            SUB_APP_HEADER_HEIGHT + APP_HEADER_HEIGHT
          }px)`}
          scrollable
        >
          <List>
            {builds.length > 0 ? (
              <>
                {builds.map((build: Build) => (
                 <BuildCard
                   key = {build.build_id}
                   build={build}
                   selected={ selectedBuild?.build_id === build.build_id
                 }/>
                ))}
              </>
            ) : (
              <EmptyMessage>No Builds found for given filter.</EmptyMessage>
            )}
          </List>
        </Row>
      </SerialLayout>
    </Container>
  );
}
