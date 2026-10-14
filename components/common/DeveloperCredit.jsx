import React from 'react';

export default function DeveloperCredit() {
  return (
    <footer className="aopd-developer-credit">
      <div className="aopd-developer-intro">
        <span className="aopd-developer-eyebrow">DEVELOPER & SUPPORT</span>
        <strong>Regasa Feyisa</strong>
        <span className="aopd-developer-caption">Get in touch for questions or support.</span>
      </div>
      <div className="aopd-developer-contacts">
        <a className="aopd-developer-contact" href="mailto:fregasa7@gmail.com">
          <span>Email</span>
          <strong>fregasa7@gmail.com</strong>
        </a>
        <a className="aopd-developer-contact" href="tel:+251900657115">
          <span>Phone</span>
          <strong>+251 900 657 115</strong>
        </a>
        <a className="aopd-developer-contact" href="https://t.me/Rpac2" target="_blank" rel="noreferrer">
          <span>Telegram</span>
          <strong>@Rpac2</strong>
        </a>
      </div>
    </footer>
  );
}
