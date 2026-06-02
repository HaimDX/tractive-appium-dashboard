import React from "react";
import { NavLink } from "react-router-dom";
import './header.css';
import DeviceFarmLogo from '../../../../assets/logo-tractive-white.png';
import { BASE_URL, METRICS_URL } from "../../../../constants/routes";

export const Header = () => {

  return(
    <div className="header-container">
      <div className="header-logo-container">
        <img src={DeviceFarmLogo} alt="Tractive Appium Dashboard" className="header-logo-image" />
        <div className="header-logo">Tractive Appium Dashboard</div>
      </div>
      <nav className="header-nav">
        <NavLink
          exact
          to={BASE_URL || "/"}
          className="header-nav-link"
          activeClassName="header-nav-link--active"
          isActive={(match, location) =>
            !!match || !location.pathname.startsWith(METRICS_URL)
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to={METRICS_URL}
          className="header-nav-link"
          activeClassName="header-nav-link--active"
        >
          Metrics
        </NavLink>
      </nav>
    </div>
  )
}