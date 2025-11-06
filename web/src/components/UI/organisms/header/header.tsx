import React from "react";
import './header.css';
import DeviceFarmLogo from '../../../../assets/logo-tractive-white.png';

export const Header = () => {

  return(
    <div className="header-container">
      <div className="header-logo-container">
        <img src={DeviceFarmLogo} alt="Tractive Appium Dashboard" className="header-logo-image" />
        <div className="header-logo">Tractive Appium Dashboard</div>
      </div>
    </div>
  )
}





