import { DAY_LABELS, DAYS_COUNT, PERIODS_COUNT, getPeriodLabel } from "../lib/constants";

export interface GridSlot {
  label?: string;
  status?: string;
  color?: string;
  highlight?: boolean;
  highlightColor?: string;
  onClick?: () => void;
}

interface Props {
  slots: GridSlot[][];
  onSlotClick?: (day: number, period: number) => void;
  renderCell?: (day: number, period: number, slot: GridSlot) => React.ReactNode;
}

export function TimetableGrid({ slots, onSlotClick, renderCell }: Props) {
  return (
    <div className="grid-7x11">
      {/* Header row */}
      <div className="header-cell" />
      {DAY_LABELS.map((label) => (
        <div key={label} className="header-cell">
          {label}
        </div>
      ))}

      {/* Period rows */}
      {Array.from({ length: PERIODS_COUNT }, (_, period) => (
        <>
          <div key={`p-${period}`} className="period-label">
            {getPeriodLabel(period)}
          </div>
          {Array.from({ length: DAYS_COUNT }, (_, day) => {
            const slot = slots[day]?.[period] || {};
            const className = [
              "slot-cell",
              slot.status || "free",
              slot.highlight ? "highlight" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={`${day}-${period}`}
                className={className}
                style={{
                  ...(slot.color ? { background: slot.color } : {}),
                  ...(slot.highlightColor
                    ? {
                        boxShadow: `inset 0 0 0 2px ${slot.highlightColor}`,
                      }
                    : {}),
                }}
                onClick={() => {
                  slot.onClick?.();
                  onSlotClick?.(day, period);
                }}
              >
                {renderCell
                  ? renderCell(day, period, slot)
                  : slot.label || ""}
              </div>
            );
          })}
        </>
      ))}
    </div>
  );
}
