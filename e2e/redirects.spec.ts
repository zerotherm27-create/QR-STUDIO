import { expect, test } from "@playwright/test";
import {
  appEnvironmentReason,
  credentials,
  hasAppEnvironment,
  signIn,
  uniqueDestination,
} from "./helpers";

const user = credentials("E2E_USER");

test.skip(!hasAppEnvironment, appEnvironmentReason);
test.skip(
  !user,
  "Set E2E_USER_EMAIL and E2E_USER_PASSWORD with an invited test account.",
);

test("a stable short link follows update, disable, and delete lifecycle", async ({
  page,
}) => {
  await signIn(page, user!);
  const initialDestination = uniqueDestination("redirect-initial");
  const updatedDestination = uniqueDestination("redirect-updated");

  const createResponse = await page.request.post("/api/qr", {
    data: {
      destinationUrl: initialDestination,
      title: `Redirect lifecycle ${Date.now()}`,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    shortUrl: string;
    slug: string;
  };

  const firstRedirect = await page.request.get(created.shortUrl, {
    maxRedirects: 0,
  });
  expect(firstRedirect.status()).toBe(302);
  expect(firstRedirect.headers().location).toBe(initialDestination);

  const updateResponse = await page.request.patch(`/api/qr/${created.slug}`, {
    data: { destinationUrl: updatedDestination },
  });
  expect(updateResponse.status()).toBe(200);
  const updated = (await updateResponse.json()) as { shortUrl: string };
  expect(updated.shortUrl).toBe(created.shortUrl);

  const secondRedirect = await page.request.get(created.shortUrl, {
    maxRedirects: 0,
  });
  expect(secondRedirect.status()).toBe(302);
  expect(secondRedirect.headers().location).toBe(updatedDestination);

  const disableResponse = await page.request.patch(`/api/qr/${created.slug}`, {
    data: { status: "disabled" },
  });
  expect(disableResponse.status()).toBe(200);
  const disabled = await page.request.get(created.shortUrl, {
    maxRedirects: 0,
  });
  expect(disabled.status()).toBe(410);

  const deleteResponse = await page.request.delete(`/api/qr/${created.slug}`);
  expect(deleteResponse.status()).toBe(204);
  const missing = await page.request.get(created.shortUrl, {
    maxRedirects: 0,
  });
  expect(missing.status()).toBe(404);
});
