import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size = 16): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };
}

export function IconPlus({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSearch({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconSparkle({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

export function IconLibrary({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4" y="4" width="6.5" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="16" rx="1.5" />
    </svg>
  );
}

export function IconChevronDown({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconMore({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  );
}

export function IconClose({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconArrowUp({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function IconStop({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </svg>
  );
}

export function IconPaperclip({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.78-7.78l9-9a3.5 3.5 0 1 1 4.95 4.95L9.62 16.21a1.5 1.5 0 1 1-2.12-2.12L15 6.5" />
    </svg>
  );
}

export function IconMic({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="9.5" y="3" width="5" height="11" rx="2.5" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </svg>
  );
}

export function IconSlash({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M16 4 8 20" />
    </svg>
  );
}

export function IconImage({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  );
}

export function IconFile({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconAudio({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />
    </svg>
  );
}

export function IconCopy({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function IconDownload({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 4v12M6 12l6 6 6-6M5 20h14" />
    </svg>
  );
}

export function IconGlobe({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.7 3.8 5.7 3.8 8.5 0 2.8-1.3 5.8-3.8 8.5M12 3.5c-2.5 2.7-3.8 5.7-3.8 8.5 0 2.8 1.3 5.8 3.8 8.5" />
    </svg>
  );
}

export function IconTerminal({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 7l4 5-4 5M13 17h6" />
    </svg>
  );
}

export function IconCheck({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m5 12 5 5 9-11" />
    </svg>
  );
}

export function IconAlert({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 8v5M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function IconBrain({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M9 5.5a2.5 2.5 0 0 0-2.5 2.5v1A2.5 2.5 0 0 0 4 11.5v1A2.5 2.5 0 0 0 6.5 15v1A2.5 2.5 0 0 0 9 18.5h.5V5.5z" />
      <path d="M15 5.5A2.5 2.5 0 0 1 17.5 8v1a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5h-.5v-13z" />
    </svg>
  );
}

export function IconPanel({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
    </svg>
  );
}

export function IconCommand({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M8.5 5.5A2 2 0 1 1 6.5 7.5h11a2 2 0 1 1-2 2v-4a2 2 0 1 1 2 2h-11a2 2 0 1 1 2-2v4a2 2 0 1 1-2 2" />
    </svg>
  );
}

export function IconAgents({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="9" cy="10" r="3" />
      <circle cx="16" cy="13" r="2.5" />
      <path d="M3 20c.7-2.7 3.1-4.5 6-4.5s5.3 1.8 6 4.5M13 20c.4-1.6 1.8-2.7 3.5-2.7s3.1 1.1 3.5 2.7" />
    </svg>
  );
}
