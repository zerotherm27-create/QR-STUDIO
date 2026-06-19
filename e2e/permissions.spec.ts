import { expect, test } from "@playwright/test";
import {
  appEnvironmentReason,
  credentials,
  hasAppEnvironment,
  signIn,
  uniqueDestination,
} from "./helpers";

const primaryUser = credentials("E2E_USER");
const secondUser = credentials("E2E_SECOND_USER");
const adminUser = credentials("E2E_ADMIN");
const accountReason =
  "Set E2E_USER_EMAIL/PASSWORD, E2E_SECOND_USER_EMAIL/PASSWORD, and E2E_ADMIN_EMAIL/PASSWORD with invited test accounts.";

test.skip(!hasAppEnvironment, appEnvironmentReason);
test.skip(!primaryUser || !secondUser || !adminUser, accountReason);

test("regular users are isolated while an admin can see all records", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await signIn(firstPage, primaryUser!);

  const destinationUrl = uniqueDestination("permissions");
  const title = `Permissions ${Date.now()}`;
  const createResponse = await firstPage.request.post("/api/qr", {
    data: { destinationUrl, title },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { slug: string };

  await firstPage.goto("/dashboard");
  await expect(firstPage.getByRole("heading", { name: title })).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await signIn(secondPage, secondUser!);
  const forbiddenResponse = await secondPage.request.get(
    `/api/qr/${created.slug}`,
  );
  expect([403, 404]).toContain(forbiddenResponse.status());
  await secondPage.goto(`/dashboard/qr/${created.slug}`);
  await expect(secondPage.getByText("This page could not be found")).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, adminUser!);
  await adminPage.goto("/admin");
  await expect(adminPage.getByRole("heading", { name: title })).toBeVisible();
  await expect(adminPage.getByText(primaryUser!.email, { exact: true })).toBeVisible();

  const deleteResponse = await firstPage.request.delete(
    `/api/qr/${created.slug}`,
  );
  expect(deleteResponse.status()).toBe(204);

  await Promise.all([
    firstContext.close(),
    secondContext.close(),
    adminContext.close(),
  ]);
});
