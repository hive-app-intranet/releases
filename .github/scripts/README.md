# Release tooling

```bash
npm --prefix .github/scripts run next-version
```

Shows the next version (patch/minor/major) based on the latest tag.

```bash
# write the chosen version's heading in CHANGELOG.md
```

```bash
cd ../hive && npm run build
```

Builds and drops the output in `build/` here.

```bash
cd ../hive-release
npm --prefix .github/scripts run publish
```

Commits, tags, pushes, and creates the GitHub release. Requires `gh` authenticated. The version is read from CHANGELOG.md's own heading — nothing to pass in.
