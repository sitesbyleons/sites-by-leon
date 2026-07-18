import { expect, test as baseTest, type Page } from '@playwright/test';

type GuardState = {
  browserViolations: string[];
  consoleViolations: string[];
};

const guardState = new WeakMap<Page, GuardState>();
const cspConsolePattern = /content security policy directive|violates the following content security policy|refused to (?:apply|connect|execute|frame|load)/i;

export const useCspGuard = (test: typeof baseTest) => {
  test.beforeEach(async ({ page }) => {
    const state: GuardState = { browserViolations: [], consoleViolations: [] };
    guardState.set(page, state);

    page.on('console', (message) => {
      if (cspConsolePattern.test(message.text())) state.consoleViolations.push(message.text());
    });

    await page.exposeFunction('__leonReportCspViolation', (violation: string) => {
      state.browserViolations.push(violation);
    });
    await page.addInitScript(() => {
      const guardedWindow = window as Window & {
        __leonReportCspViolation?: (violation: string) => Promise<void>;
      };
      document.addEventListener('securitypolicyviolation', (event) => {
        void guardedWindow.__leonReportCspViolation?.(
          `${event.effectiveDirective}: ${event.blockedURI || 'inline'}`,
        );
      });
    });
  });

  test.afterEach(({ page }) => {
    const state = guardState.get(page);
    const violations = [...new Set([
      ...(state?.consoleViolations ?? []),
      ...(state?.browserViolations ?? []),
    ])];

    expect(violations, 'Browser reported Content Security Policy violations.').toEqual([]);
  });
};
