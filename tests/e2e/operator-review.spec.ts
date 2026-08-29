import { expect, test } from "@playwright/test";

test("an operator creates and inspects an automatically active claim", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const title = `E2E reviewer observation ${suffix}`;
  const statement = `A reviewer can trace the E2E decision path ${suffix}.`;

  await page.goto("/inbox?workspace=e2e");
  await expect(page).toHaveURL(/\/knowledge\?workspace=e2e$/);
  await expect(page.getByRole("link", { name: "Inbox" })).toHaveCount(0);
  await page.getByText("Add one exact atomic statement instead").click();
  await page.getByLabel("Short title").fill(title);
  await page.getByLabel("Atomic canonical statement").fill(statement);
  await page.getByRole("button", { name: "Create active claim" }).click();
  await expect(page.getByRole("link", { name: statement })).toBeVisible();

  await page.getByRole("link", { name: statement }).click();
  await expect(page.locator("blockquote")).toContainText(statement);
  await expect(page.getByText("UNVERIFIED", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Library" }).click();
  await page.getByLabel("Search statements").fill(suffix);
  await page.getByRole("button", { name: "Apply filters" }).click();
  const row = page.locator("tr").filter({ hasText: statement });
  await expect(row).toContainText("ACTIVE");
  await expect(row).toContainText("CLAIM");
  await expect(row).toContainText("UNVERIFIED");
});

test("an operator imports pasted source material through the guided intake", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const title = `E2E interview notes ${suffix}`;

  await page.goto("/add?workspace=e2e");
  await expect(page.getByLabel("Source name Optional")).toBeVisible();
  await page.getByLabel("Source name Optional").fill(title);
  await page
    .getByLabel("Paste your material")
    .fill(`The review team needs a visible evidence path for every decision. ${suffix}`);
  await page.getByRole("button", { name: "Import text" }).click();

  const receipt = page.getByRole("status");
  await expect(receipt).toContainText(title);
  await expect(receipt).toContainText("Source saved");
  const receiptLink = receipt.getByRole("link");
  await expect(receiptLink).toHaveText(/View (knowledge|extraction)/);
  await receiptLink.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an operator can manage model access from settings", async ({ page }) => {
  await page.goto("/settings?workspace=e2e");

  await expect(page.getByRole("heading", { level: 1, name: "Model access" })).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Routine model" })).toHaveValue(
    "google/gemini-2.5-flash-lite",
  );
  await expect(page.getByRole("button", { name: "Save model access" })).toBeVisible();
});
