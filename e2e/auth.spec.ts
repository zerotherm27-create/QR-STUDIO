import { expect, test } from "@playwright/test";
import {
  appEnvironmentReason,
  hasAppEnvironment,
} from "./helpers";

test.describe("invite-only authentication", () => {
  test.skip(!hasAppEnvironment, appEnvironmentReason);

  test("anonymous visitors are redirected away from protected pages", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("the login page has no public registration path", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByText("Public sign-up is not available."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(
      0,
    );

    const signupResponse = await page.request.get("/signup");
    expect(signupResponse.status()).toBe(404);
  });
});
