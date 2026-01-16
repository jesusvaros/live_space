import React from 'react';
import { IconCheckCircle, IconHeart, IconHeartFilled, IconShare } from '../icons';

type SecondaryActionsProps = {
  followed: boolean;
  attendanceActive: boolean;
  attendanceLabel: string;
  followLoading?: boolean;
  attendanceLoading?: boolean;
  onToggleFollow: () => void;
  onToggleAttendance: () => void;
  onShare: () => void;
};

const SecondaryActions: React.FC<SecondaryActionsProps> = ({
  followed,
  attendanceActive,
  attendanceLabel,
  followLoading,
  attendanceLoading,
  onToggleFollow,
  onToggleAttendance,
  onShare,
}) => {
  return (
    <div className="event-secondary-actions">
      <button
        type="button"
        className={`action-icon ${followed ? 'is-active' : ''}`}
        onClick={onToggleFollow}
        disabled={followLoading}
        aria-pressed={followed}
      >
        {followed ? <IconHeartFilled className="app-icon" /> : <IconHeart className="app-icon" />}
        <span>Follow</span>
      </button>
      <button
        type="button"
        className={`action-icon ${attendanceActive ? 'is-active' : ''}`}
        onClick={onToggleAttendance}
        disabled={attendanceLoading}
        aria-pressed={attendanceActive}
      >
        <IconCheckCircle className="app-icon" />
        <span>{attendanceLabel}</span>
      </button>
      <button type="button" className="action-icon" onClick={onShare}>
        <IconShare className="app-icon" />
        <span>Share</span>
      </button>
    </div>
  );
};

export default SecondaryActions;
