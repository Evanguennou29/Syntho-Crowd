The Chromium worker runs as a non-root user with `chromium_sandbox=True`.
`seccomp_profile.json` is vendored unchanged from Microsoft Playwright v1.64.1:
https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json

The upstream Apache 2.0 license is in `PLAYWRIGHT-LICENSE`.
This profile permits Chromium user namespaces. The host must support unprivileged
user namespaces; do not work around unsupported hosts by disabling the sandbox.
