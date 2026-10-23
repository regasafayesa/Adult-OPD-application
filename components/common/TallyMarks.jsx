import React from 'react';
import { getTallyGroupSizes, normalizeTallyCount } from '../../utils/tallyMarks.mjs';

function TallyGroup({ size }) {
  return (
    <svg
      className="aopd-tally-group"
      viewBox="0 0 18 14"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: size === 5 ? 4 : size }, (_, index) => (
        <line
          key={index}
          x1={2.5 + index * 3}
          y1="1.5"
          x2={2.5 + index * 3}
          y2="12.5"
        />
      ))}
      {size === 5 && <line className="aopd-tally-cross" x1="1" y1="12.5" x2="13" y2="1.5" />}
    </svg>
  );
}

export default function TallyMarks({ count }) {
  const safeCount = normalizeTallyCount(count);
  const groups = getTallyGroupSizes(safeCount);

  return (
    <span className="aopd-tally-marks" role="img" aria-label={`${safeCount} tally marks`}>
      {groups.map((size, index) => (
        <TallyGroup key={index} size={size} />
      ))}
    </span>
  );
}
