import React from 'react';

const PageHeader = ({ eyebrow, title, description, action }) => (
  <div className="dlas-page-header">
    <div className="min-w-0">
      {eyebrow && <p className="dlas-page-eyebrow">{eyebrow}</p>}
      <h1 className="dlas-page-title">{title}</h1>
      {description && <p className="dlas-page-description">{description}</p>}
    </div>
    {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
  </div>
);

export default PageHeader;
