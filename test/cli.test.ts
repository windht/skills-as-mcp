import path from "node:path";

import { buildCliConfig } from "../src/cli.js";

describe("buildCliConfig", () => {
  it("supports repeated --skills-dir values", () => {
    const config = buildCliConfig(
      {
        skillsDir: ["/tmp/skills-a", "/tmp/skills-b"],
        type: "stdio",
        host: "127.0.0.1",
        port: 3000
      },
      {}
    );

    expect(config).toMatchObject({
      skillDirs: ["/tmp/skills-a", "/tmp/skills-b"],
      type: "stdio"
    });
  });

  it("falls back to SKILLS_DIR and SKILLS_DIRS", () => {
    const config = buildCliConfig(
      {
        skillsDir: [],
        type: "http",
        host: "0.0.0.0",
        port: 8080
      },
      {
        SKILLS_DIR: "/tmp/skills-primary",
        SKILLS_DIRS: ["/tmp/skills-extra-a", "/tmp/skills-extra-b"].join(path.delimiter)
      }
    );

    expect(config.skillDirs).toEqual([
      "/tmp/skills-primary",
      "/tmp/skills-extra-a",
      "/tmp/skills-extra-b"
    ]);
  });

  it("fails when no skills directory is configured", () => {
    expect(() =>
      buildCliConfig(
        {
          skillsDir: [],
          type: "stdio",
          host: "127.0.0.1",
          port: 3000
        },
        {}
      )
    ).toThrow("At least one --skills-dir is required");
  });

  it("validates the transport type", () => {
    expect(() =>
      buildCliConfig(
        {
          skillsDir: ["/tmp/skills"],
          type: "stdout",
          host: "127.0.0.1",
          port: 3000
        },
        {}
      )
    ).toThrow('Invalid --type "stdout"');
  });
});
