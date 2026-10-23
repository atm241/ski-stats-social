import { describe, expect, it } from "vitest";
import { fromPostmark, tokenFromRecipients } from "./inbound";

const D = "upload.example.com";

describe("tokenFromRecipients", () => {
  it("finds the token on our domain", () => {
    expect(tokenFromRecipients(["friend@gmail.com", "abcdefghjk23@upload.example.com"], D)).toBe("abcdefghjk23");
  });
  it("handles display names, case and plus tags", () => {
    expect(tokenFromRecipients(['"Ski uploads" <ABCDEFGHJK23+vail@Upload.Example.com>'], D)).toBe("abcdefghjk23");
  });
  it("rejects other domains and malformed tokens", () => {
    expect(tokenFromRecipients(["abcdefghjk23@evil.com"], D)).toBeNull();
    expect(tokenFromRecipients(["short@upload.example.com"], D)).toBeNull();
    expect(tokenFromRecipients(["abcdefghjk23x@upload.example.com"], D)).toBeNull();
  });
});

describe("fromPostmark", () => {
  it("collects recipients and decodes attachments", () => {
    const email = fromPostmark({
      FromFull: { Email: "me@x.com" },
      OriginalRecipient: "abcdefghjk23@upload.example.com",
      CcFull: [{ Email: "c@x.com" }],
      Subject: "day",
      Attachments: [{ Name: "day.gpx", ContentType: "application/gpx+xml", Content: Buffer.from("<gpx/>").toString("base64") }],
    });
    expect(email.recipients).toEqual(["abcdefghjk23@upload.example.com", "c@x.com"]);
    expect(email.from).toBe("me@x.com");
    expect(email.attachments[0].content.toString()).toBe("<gpx/>");
  });
});
