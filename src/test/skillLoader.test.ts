import { describe, expect, it } from "vitest";

import { loadAllSkills, parseSkillManifest, resolveGlobalSkillManifestPath } from "../skills/skillLoader";

describe("skill loader", () => {
  it("parses valid custom skills and prefixes ids", () => {
    const manifest = JSON.stringify({
      skills: [
        {
          id: "my-skill",
          name: "My Skill",
          weaponType: "blade",
          description: "Insert a section scaffold.",
          actionLabel: "Execute",
          action: {
            type: "snippet",
            snippet: "\\section{${1:Title}}",
          },
        },
        {
          id: "bad-skill",
          name: "Bad Skill",
          weaponType: "laser",
          description: "Broken",
          actionLabel: "Nope",
          action: {
            type: "snippet",
            snippet: "broken",
          },
        },
      ],
    });

    const parsed = parseSkillManifest(manifest, "workspace/.viewerleaf-skills.json");

    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0]).toMatchObject({
      id: "custom:my-skill",
      isCustom: true,
      weaponType: "blade",
      action: {
        type: "snippet",
        snippet: "\\section{${1:Title}}",
      },
    });
    expect(parsed.skills[0]?.themeColors.primary).toBe("#0f766e");
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bad-skill"),
        expect.stringContaining("weaponType"),
      ]),
    );
  });

  it("merges workspace and global manifests while skipping duplicates", async () => {
    const globalPath = resolveGlobalSkillManifestPath("~/.viewerleaf/skills.json");
    const files = new Map<string, string>([
      [
        "/tmp/paper/.viewerleaf-skills.json",
        JSON.stringify({
          skills: [
            {
              id: "workspace-note",
              name: "Workspace Note",
              weaponType: "shield",
              description: "Open a checklist.",
              actionLabel: "Review",
              action: {
                type: "checklist",
                checklist: "- [ ] Check intro",
              },
            },
          ],
        }),
      ],
      [
        globalPath,
        JSON.stringify({
          skills: [
            {
              id: "workspace-note",
              name: "Duplicate",
              weaponType: "shield",
              description: "Should be skipped.",
              actionLabel: "Skip",
              action: {
                type: "checklist",
                checklist: "- [ ] Duplicate",
              },
            },
            {
              id: "global-polish",
              name: "Global Polish",
              weaponType: "spear",
              description: "Send to Claude Code.",
              actionLabel: "Polish",
              themeColors: {
                primary: "#123456",
                secondary: "#abcdef",
                accent: "#654321",
              },
              action: {
                type: "claudeCode",
                prompt: "Polish {{fileName}} at line {{lineNumber}}",
              },
            },
          ],
        }),
      ],
    ]);

    const result = await loadAllSkills({
      builtins: [],
      workspaceRoots: ["/tmp/paper"],
      globalManifestPath: "~/.viewerleaf/skills.json",
      fileExists: async (filePath) => files.has(filePath),
      readFile: async (filePath) => {
        const content = files.get(filePath);
        if (!content) {
          throw new Error(`missing ${filePath}`);
        }
        return content;
      },
    });

    expect(result.sources).toHaveLength(2);
    expect(result.skills.map((skill) => skill.id)).toEqual([
      "custom:workspace-note",
      "custom:global-polish",
    ]);
    expect(result.skills[1]?.themeColors).toEqual({
      primary: "#123456",
      secondary: "#abcdef",
      accent: "#654321",
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("skill id 重复"),
      ]),
    );
  });
});
