"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  CalendarPlus,
  CircleDollarSign,
  ListTodo,
  Pencil,
  Plus,
} from "lucide-react";

const actionIcons = {
  bell: Bell,
  calendar: CalendarPlus,
  money: CircleDollarSign,
  pencil: Pencil,
  plus: Plus,
  todo: ListTodo,
  transfer: ArrowLeftRight,
};

interface PrototypeActionProps {
  label: string;
  icon?: keyof typeof actionIcons;
  variant?: "primary" | "secondary" | "quiet";
  iconOnly?: boolean;
}

export function PrototypeAction({
  label,
  icon,
  variant = "secondary",
  iconOnly = false,
}: PrototypeActionProps) {
  const [notice, setNotice] = useState("");
  const Icon = icon ? actionIcons[icon] : undefined;

  return (
    <span className="action-wrap">
      <button
        aria-label={iconOnly ? label : undefined}
        className={`button button-${variant}${iconOnly ? " button-icon" : ""}`}
        onClick={() => setNotice(`${label} will be available in a later phase.`)}
        title={iconOnly ? label : undefined}
        type="button"
      >
        {Icon ? <Icon aria-hidden="true" size={17} strokeWidth={1.8} /> : null}
        {!iconOnly ? label : null}
      </button>
      <span aria-live="polite" className="visually-hidden">
        {notice}
      </span>
    </span>
  );
}