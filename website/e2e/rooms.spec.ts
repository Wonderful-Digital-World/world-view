import { expect, test } from "@playwright/test";

test("renders the three native WDW rooms without external requests", async ({
	page,
}): Promise<void> => {
	const externalRequests: Array<string> = [];
	const consoleErrors: Array<string> = [];

	page.on("request", (request): void => {
		const url = new URL(request.url());

		if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
			externalRequests.push(request.url());
		}
	});
	page.on("console", (message): void => {
		if (message.type() === "error") {
			consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", (error): void => {
		consoleErrors.push(error.message);
	});

	await page.goto("/rooms");
	await expect(page).toHaveTitle("World View");
	await expect(page.getByRole("heading", { name: "World View" })).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();

	const placeSelector = page.getByTestId("place-selector");

	await expect(placeSelector.locator("option")).toHaveText([
		"Workshop",
		"Lab",
		"Outside",
	]);
	await expect(page.getByTestId("zoom-slider")).toHaveValue("1.5");

	await page.getByTestId("zoom-in").click();
	await expect(page.getByTestId("zoom-slider")).toHaveValue("1.75");
	await page.getByTestId("zoom-out").click();
	await expect(page.getByTestId("zoom-slider")).toHaveValue("1.5");
	await page.getByTestId("zoom-slider").fill("2");
	await expect(page.getByTestId("zoom-slider")).toHaveValue("2");
	await page.getByTestId("zoom-fit").click();
	await expect(page.getByTestId("zoom-slider")).toHaveValue("1.5");

	for (const [room, expectedZoom] of [
		["workshop", "1.5"],
		["lab", "1.5"],
		["outside", "1"],
	] as const) {
		await placeSelector.selectOption(room);
		await expect(page.getByTestId("active-renderer-room")).toContainText(room);
		await expect(page.getByTestId("zoom-slider")).toHaveValue(expectedZoom);
	}

	expect(externalRequests).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test("projects fixtures into mapped rooms and preserves attention state", async ({
	page,
}): Promise<void> => {
	const externalRequests: Array<string> = [];

	page.on("request", (request): void => {
		const url = new URL(request.url());

		if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
			externalRequests.push(request.url());
		}
	});

	await page.goto("/rooms");

	const fixtureSelector = page.getByTestId("fixture-selector");
	const placeSelector = page.getByTestId("place-selector");

	await expect(fixtureSelector).toHaveValue("normal-workday");
	await expect(page.getByTestId("fixture-description")).toContainText(
		"Normal Workday"
	);

	await placeSelector.selectOption("workshop");
	await expect(page.getByTestId("active-place")).toHaveText("Workshop");
	await expect(page.getByTestId("active-renderer-room")).toContainText(
		"workshop"
	);
	await expect(page.getByTestId("resident-card-bridget")).toBeVisible();
	await expect(page.getByTestId("resident-card-banjo")).toContainText(
		"working"
	);
	await page.screenshot({
		fullPage: true,
		path: test.info().outputPath("wp3-normal-workday-workshop.png"),
	});
	await placeSelector.selectOption("lab");
	await expect(page.getByTestId("resident-card-coach")).toBeVisible();
	await expect(page.getByTestId("resident-card-mini-me")).toBeVisible();

	await fixtureSelector.selectOption("needs-haley");
	await expect(page.getByTestId("fixture-description")).toContainText(
		"Needs Haley"
	);
	await placeSelector.selectOption("workshop");
	await expect(page.getByTestId("resident-card-bridget")).toContainText(
		"Needs user"
	);
	await expect(page.getByTestId("resident-card-bridget")).toContainText(
		"Needs Haley"
	);

	await fixtureSelector.selectOption("blocked");
	await expect(page.getByTestId("fixture-description")).toContainText(
		"Blocked"
	);
	await placeSelector.selectOption("workshop");
	await expect(page.getByTestId("resident-card-banjo")).toContainText(
		"Blocked"
	);
	await expect(page.getByTestId("resident-card-banjo")).toContainText(
		"Waiting for a decision"
	);
	await page.screenshot({
		fullPage: true,
		path: test.info().outputPath("wp3-blocked-workshop.png"),
	});

	expect(externalRequests).toEqual([]);
});
