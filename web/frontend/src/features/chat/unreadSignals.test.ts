import { describe, expect, it } from "vitest";
import { formatUnreadTitle, totalUnread } from "./unreadSignals";

describe("totalUnread", () => {
  it("returns 0 for no sessions", () => {
    expect(totalUnread([])).toBe(0);
  });

  it("sums counts across unread sessions", () => {
    expect(
      totalUnread([
        { unread: true, unreadCount: 2 },
        { unread: true, unreadCount: 3 },
      ]),
    ).toBe(5);
  });

  it("ignores sessions not flagged unread, even with a stale count", () => {
    expect(
      totalUnread([
        { unread: false, unreadCount: 4 },
        { unread: true, unreadCount: 1 },
      ]),
    ).toBe(1);
  });

  it("treats a missing unreadCount as 0", () => {
    expect(totalUnread([{ unread: true }])).toBe(0);
  });
});

describe("formatUnreadTitle", () => {
  it("returns the base title when nothing is unread", () => {
    expect(formatUnreadTitle("Hermes", 0)).toBe("Hermes");
    expect(formatUnreadTitle("Hermes", -1)).toBe("Hermes");
  });

  it("prefixes the count", () => {
    expect(formatUnreadTitle("Hermes", 1)).toBe("(1) Hermes");
    expect(formatUnreadTitle("Hermes", 99)).toBe("(99) Hermes");
  });

  it("caps at 99+", () => {
    expect(formatUnreadTitle("Hermes", 100)).toBe("(99+) Hermes");
    expect(formatUnreadTitle("Hermes", 1500)).toBe("(99+) Hermes");
  });
});
