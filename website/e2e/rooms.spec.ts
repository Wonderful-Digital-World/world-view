import { expect, test } from "@playwright/test";

test("renders all five rooms without external requests", async ({
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
	await expect(page).toHaveTitle("World View");
	await expect(page.getByRole("heading", { name: "World View" })).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();

	const roomButtons = page.getByTestId("renderer-room-button");

	await expect(roomButtons).toHaveCount(5);

	for (let index = 0; index < 5; index += 1) {
		const roomButton = roomButtons.nth(index);

		await roomButton.click();
		await expect(roomButton).toHaveAttribute("aria-pressed", "true");
	}

	expect(externalRequests).toEqual([]);
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
	await expect(page.getByTestId("active-place")).toHaveText(
		"Workshop → Office"
	);
	await expect(page.getByTestId("active-renderer-room")).toContainText(
		"office"
	);
	await expect(page.getByTestId("resident-card-banjo")).toContainText(
		"working"
	);
	await page.screenshot({
		fullPage: true,
		path: "test-results/wp3-normal-workday-workshop.png",
	});

	await fixtureSelector.selectOption("needs-haley");
	await expect(page.getByTestId("fixture-description")).toContainText(
		"Needs Haley"
	);
	await placeSelector.selectOption("main-square");
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
		path: "test-results/wp3-blocked-workshop.png",
	});

	expect(externalRequests).toEqual([]);
});
