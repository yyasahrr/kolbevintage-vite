/** Mutates catalogue/stock: run only against the dedicated disposable local database. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import pg from "pg";
import sharp from "sharp";
const base = process.env.BROWSER_TEST_BASE,
  dbUrl = process.env.BROWSER_TEST_DATABASE_URL;
if (
  process.env.CANVAS_SMOKE_ALLOW_MUTATIONS !== "1" ||
  !base ||
  !dbUrl ||
  !["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname) ||
  !new URL(dbUrl).pathname.startsWith("/kv_canvas_ui_") ||
  !process.env.PLAYWRIGHT_CHROMIUM_PATH
)
  throw Error("Requires opt-in and a disposable local test database.");
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  }),
  errors = [];
try {
  const token = (await (await context.request.get(`${base}/api/csrf`)).json())
      .token,
    headers = { "x-csrf-token": token };
  const cats = await (
      await context.request.get(`${base}/api/admin/categories`)
    ).json(),
    name = `کارت آزمون ${Date.now()}`;
  const make = await context.request.post(`${base}/api/admin/products`, {
    headers,
    data: {
      name,
      category: cats.find((c) => c.active).name,
      garment: "coat",
      price: 100,
      colorName: "مشکی",
      colorHex: "#111111",
      sizes: ["M", "L"],
      imageUrl: "https://example.com/one.jpg",
    },
  });
  assert.equal(make.status(), 201, await make.text());
  const id = (await make.json()).id;
  const options = await context.request.post(
    `${base}/api/admin/products/${id}/options`,
    { headers, data: { action: "add_color", name: "سبز", hex: "#276044" } },
  );
  assert.equal(options.status(), 200, await options.text());
  const color = (await options.json()).colors.find((c) => c.name === "سبز").id;
  for (const [url, role, colorId] of [
    ["https://example.com/two.jpg", "hover", "*"],
    ["https://example.com/three.jpg", "gallery", "*"],
    ["https://example.com/green.jpg", "gallery", color],
  ]) {
    const r = await context.request.post(
      `${base}/api/admin/products/${id}/images`,
      { headers, data: { action: "add", url, role, colorId } },
    );
    assert.equal(r.status(), 200, await r.text());
  }
  const opaque = await sharp({
    create: { width: 40, height: 50, channels: 3, background: "#336644" },
  })
    .jpeg()
    .toBuffer();
  const rejected = await context.request.post(
    `${base}/api/admin/products/${id}/images`,
    {
      headers,
      data: {
        action: "add",
        imageData: `data:image/jpeg;base64,${opaque.toString("base64")}`,
        role: "cutout",
        colorId: "*",
      },
    },
  );
  assert.equal(
    rejected.status(),
    422,
    "opaque photo must not be mislabeled as transparent",
  );
  const blank = await sharp({
    create: {
      width: 40,
      height: 50,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const rejectedBlank = await context.request.post(
    `${base}/api/admin/products/${id}/images`,
    {
      headers,
      data: {
        action: "add",
        imageData: `data:image/png;base64,${blank.toString("base64")}`,
        role: "cutout",
        colorId: "*",
      },
    },
  );
  assert.equal(
    rejectedBlank.status(),
    422,
    "entirely transparent file must be rejected",
  );
  const rejectedUrl = await context.request.post(
    `${base}/api/admin/products/${id}/images`,
    {
      headers,
      data: {
        action: "add",
        url: "https://example.com/cutout.png",
        role: "cutout",
        colorId: "*",
      },
    },
  );
  assert.equal(
    rejectedUrl.status(),
    422,
    "remote URL is not verified as transparent",
  );
  const originalImages = (
    await (await context.request.get(`${base}/api/products/${id}`)).json()
  ).images.map(({ id, url, colorId, role }) => ({ id, url, colorId, role }));
  const rejectedRelabel = await context.request.post(
    `${base}/api/admin/products/${id}/images`,
    {
      headers,
      data: {
        action: "update",
        imageId: originalImages[0].id,
        role: "cutout",
        colorId: "*",
        expected: originalImages,
      },
    },
  );
  assert.equal(
    rejectedRelabel.status(),
    422,
    "existing opaque images cannot be relabeled",
  );
  const makeCutout = async (paint, colorId) => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect x="20" y="15" width="40" height="70" fill="${paint}"/></svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const res = await context.request.post(
      `${base}/api/admin/products/${id}/images`,
      {
        headers,
        data: {
          action: "add",
          imageData: `data:image/png;base64,${png.toString("base64")}`,
          role: "cutout",
          colorId,
        },
      },
    );
    assert.equal(res.status(), 200, await res.text());
    return (await res.json()).images.find(
      (i) => i.role === "cutout" && i.colorId === colorId,
    ).url;
  };
  const sharedCutout = await makeCutout("#664422", "*"),
    greenCutout = await makeCutout("#448855", color);
  const cutoutImage = await context.request.get(`${base}${greenCutout}`);
  assert.equal(cutoutImage.status(), 200);
  const alpha = (await sharp(await cutoutImage.body()).stats()).channels[3];
  assert.ok(alpha.min === 0 && alpha.max > 0, "alpha preserved on upload");
  const activated = await context.request.patch(
    `${base}/api/admin/products/${id}`,
    { headers, data: { active: true } },
  );
  assert.equal(activated.status(), 200, await activated.text());
  const fixtures = [];
  for (const mode of ["single", "none"]) {
    const fixtureName = `آزمون تصویر ${mode} ${Date.now()}`;
    const created = await context.request.post(`${base}/api/admin/products`, {
      headers,
      data: {
        name: fixtureName,
        category: cats.find((c) => c.active).name,
        garment: "coat",
        price: 100,
        colorName: "مشکی",
        colorHex: "#111111",
        sizes: ["M"],
        imageUrl: "https://example.com/one.jpg",
      },
    });
    assert.equal(created.status(), 201, await created.text());
    const fixtureId = (await created.json()).id;
    const published = await context.request.patch(
      `${base}/api/admin/products/${fixtureId}`,
      { headers, data: { active: true } },
    );
    assert.equal(published.status(), 200);
    fixtures.push({ name: fixtureName, mode, id: fixtureId });
  }
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  await db.query(
    "update product_variants set on_hand=case when color_id=$2 then 1 else 5 end where product_id=$1",
    [id, color],
  );
  await db.query("delete from product_images where product_id=$1", [
    fixtures.find((f) => f.mode === "none").id,
  ]);
  await db.end();
  await context.route("https://example.com/*.jpg", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="100%" height="100%" fill="${route.request().url().includes("two") ? "#aabbbb" : "#ddc1a4"}"/></svg>`,
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Real storefront grids: two on phones, three on tablets, more on wide screens.
  for (const [width, shopColumns, homeColumns] of [
    [390, 2, 2],
    [767, 2, 2],
    [768, 3, 3],
    [1024, 3, 4],
    [1280, 4, 5],
    [1536, 5, 5],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/#/products`, { waitUntil: "networkidle" });
    const shop = page.locator(".product-list-grid");
    assert.equal(
      (
        await shop.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
      ).split(" ").length,
      shopColumns,
      `shop grid at ${width}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `shop overflow at ${width}`,
    );
    await page.goto(`${base}/#/`, { waitUntil: "networkidle" });
    const arrivals = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "تازه رسیده‌ها" }) })
      .locator(".grid");
    assert.equal(
      (
        await arrivals.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns,
        )
      ).split(" ").length,
      homeColumns,
      `home grid at ${width}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `home overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/#/products?q=${encodeURIComponent(name)}`, {
    waitUntil: "networkidle",
  });
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.waitFor();
  const media = card.locator(".card-media");
  const image = media.locator("img");
  await image.waitFor();
  assert.equal(await image.getAttribute("src"), "https://example.com/one.jpg");
  await media.hover();
  assert.equal(
    await image.getAttribute("src"),
    "https://example.com/one.jpg",
    "hover must not skip the first image before browsing",
  );
  await page.mouse.move(700, 15);
  await page.waitForFunction(
    () => !document.querySelector(".card-media:hover"),
  );
  await image.evaluate(
    (el) =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(await image.getAttribute("src"), "https://example.com/one.jpg");
  const next = media.getByRole("button", { name: `تصویر بعدی ${name}` }),
    prev = media.getByRole("button", { name: `تصویر قبلی ${name}` });
  await next.focus();
  const before = await image.getAttribute("src");
  await next.press("Enter");
  assert.equal(await image.getAttribute("src"), "https://example.com/two.jpg");
  assert.ok(
    page.url().includes("/products"),
    "navigation must not open product",
  );
  await prev.press("Enter");
  assert.equal(await image.getAttribute("src"), before);
  // Emulate a horizontal touch gesture; vertical scrolling must not flip frames.
  await media.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, target: null, clientX: 180, clientY: 200 }],
  });
  await media.dispatchEvent("touchend", {
    changedTouches: [
      { identifier: 1, target: null, clientX: 80, clientY: 204 },
    ],
  });
  assert.notEqual(await image.getAttribute("src"), before);
  // Product details: in RTL the previous/right arrow is on the right and the next/left arrow on the left.
  for (const width of [390, 1440]) {
    const detail = await context.newPage();
    await detail.setViewportSize({ width, height: 900 });
    detail.on("pageerror", (e) => errors.push(e.message));
    await detail.goto(`${base}/#/product/${encodeURIComponent(id)}`, {
      waitUntil: "networkidle",
    });
    const view = detail.locator(width < 900 ? ".pg-mobile" : ".pg-desktop");
    const previous = view.getByRole("button", { name: "تصویر قبلی" });
    const following = view.getByRole("button", { name: "تصویر بعدی" });
    const pr = await previous.boundingBox(),
      nr = await following.boundingBox();
    assert.ok(pr.x > nr.x, `RTL arrows must point outwards at ${width}`);
    assert.equal(await previous.locator("svg.lucide-chevron-right").count(), 1);
    assert.equal(await following.locator("svg.lucide-chevron-left").count(), 1);
    assert.equal(await previous.isDisabled(), true);
    await following.click();
    if (width < 900)
      await detail.waitForFunction(
        () =>
          document
            .querySelector(".pg-mobile .pg-dots button.is-on")
            ?.getAttribute("aria-label") === "تصویر 2",
      );
    else
      assert.equal(
        await view.locator(".pg-main img").getAttribute("src"),
        "https://example.com/three.jpg",
      );
    assert.equal(await previous.isDisabled(), false);
    await previous.click();
    if (width < 900)
      await detail.waitForFunction(
        () =>
          document
            .querySelector(".pg-mobile .pg-dots button.is-on")
            ?.getAttribute("aria-label") === "تصویر 1",
      );
    else
      assert.equal(
        await view.locator(".pg-main img").getAttribute("src"),
        "https://example.com/one.jpg",
      );
    await detail.close();
  }
  // Normal motion must move both real photos in opposite directions, including wraparound.
  const animated = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await animated.route("https://example.com/*.jpg", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="100%" height="100%" fill="#ccaa99"/></svg>',
    }),
  );
  const animPage = await animated.newPage();
  animPage.on("pageerror", (e) => errors.push(e.message));
  await animPage.goto(`${base}/#/products?q=${encodeURIComponent(name)}`, {
    waitUntil: "networkidle",
  });
  const animCard = animPage
    .locator("article")
    .filter({ has: animPage.getByRole("heading", { name, exact: true }) });
  const animMedia = animCard.locator(".card-media");
  await animMedia.hover();
  await animPage.waitForTimeout(400);
  const animNext = animMedia.getByRole("button", {
    name: `تصویر بعدی ${name}`,
  });
  const animPrev = animMedia.getByRole("button", {
    name: `تصویر قبلی ${name}`,
  });
  assert.ok(
    await animNext.evaluate((el) => Number(getComputedStyle(el).opacity) > 0),
    "arrows are discoverable before focus",
  );
  const prevBox = await animPrev.boundingBox(),
    nextBox = await animNext.boundingBox();
  assert.ok(prevBox.x > nextBox.x, "card arrows in RTL order");
  const testMotion = async (button, sign) => {
    await button.click();
    await animPage.waitForTimeout(90);
    const offsets = await animMedia
      .locator(".card-gallery-slide")
      .evaluateAll((els) =>
        els.map(
          (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
        ),
      );
    assert.equal(
      offsets.length,
      2,
      `two photographs must slide together: ${offsets}`,
    );
    assert.ok(
      offsets[0] * sign > 0 && offsets[1] * sign < 0,
      `slide directions: ${offsets}`,
    );
    await animPage.waitForTimeout(400);
    assert.equal(await animMedia.locator(".card-gallery-slide").count(), 1);
  };
  await testMotion(animNext, 1);
  await testMotion(animPrev, -1);
  await testMotion(animPrev, -1); // first to last must also slide one step
  assert.equal(
    await animMedia.locator(".card-gallery-slide img").getAttribute("src"),
    "https://example.com/green.jpg",
  );
  assert.ok(
    animPage.url().includes("/products"),
    "card navigation must not open product",
  );
  await animated.close();
  for (const fixture of fixtures) {
    await page.goto(
      `${base}/#/products?q=${encodeURIComponent(fixture.name)}`,
      { waitUntil: "networkidle" },
    );
    const fixtureCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: fixture.name, exact: true }),
    });
    await fixtureCard.waitFor();
    assert.equal(
      await fixtureCard.locator(".card-gallery-arrow").count(),
      0,
      `${fixture.mode}: no gallery buttons`,
    );
    assert.equal(await fixtureCard.locator('img[src=""]').count(), 0);
    if (fixture.mode === "none")
      await fixtureCard.getByText("تصویر در دسترس نیست").waitFor();
  }
  await page.goto(`${base}/#/style-builder`, { waitUntil: "networkidle" });
  const board = page.getByRole("region", { name: "بوم چیدمان استایل" });
  await board.waitFor();
  const layout = await page.evaluate(() => {
    const products = document.querySelector(".sb-tray").getBoundingClientRect();
    const canvas = document.querySelector(".sb-main").getBoundingClientRect();
    const score = document.querySelector(".sb-side").getBoundingClientRect();
    const style = getComputedStyle(document.querySelector(".sb-board"));
    return {
      products: products.toJSON(),
      canvas: canvas.toJSON(),
      score: score.toJSON(),
      background: style.backgroundColor,
      grid: style.backgroundImage,
    };
  });
  assert.ok(
    layout.products.left >= layout.canvas.right &&
      layout.score.right <= layout.canvas.left,
    "products must be right of canvas and score to its left",
  );
  assert.equal(layout.background, "rgb(255, 255, 255)");
  assert.match(layout.grid, /linear-gradient/);
  await page
    .getByText(
      "با افزودن قطعه به بوم، امتیاز هماهنگی رنگ اینجا نمایش داده می‌شود.",
    )
    .waitFor();
  const boardBox = await board.boundingBox();
  const productTile = page.locator(".sb-tray-card").filter({
    has: page.getByRole("button", { name: `افزودن ${name} به بوم` }),
  });
  await productTile.dragTo(board, {
    targetPosition: { x: boardBox.width * 0.45, y: boardBox.height * 0.45 },
  });
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    1,
    "drag from right panel onto board",
  );
  await page.getByRole("button", { name: `افزودن ${name} به بوم` }).click();
  let item = board.getByRole("button", { name: `قطعه ${name} روی بوم` });
  await item.waitFor();
  assert.equal(await item.getAttribute("aria-pressed"), "true");
  assert.equal(await item.locator("img").getAttribute("src"), sharedCutout);
  assert.equal(
    await item.locator(".sb-canvas-caption").count(),
    0,
    "no card caption on canvas",
  );
  assert.equal(
    await item.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
    "no card background",
  );
  const pos = await item.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
  }));
  await item.focus();
  await item.press("ArrowRight");
  assert.notEqual(await item.evaluate((el) => el.style.left), pos.left);
  const keyPos = await item.evaluate((el) => ({
    left: el.style.left,
    top: el.style.top,
  }));
  const rect = await item.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 70,
    rect.y + rect.height / 2 + 60,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.notEqual(await item.evaluate((el) => el.style.top), keyPos.top);
  await page.getByRole("button", { name: "کوچک‌نمایی", exact: true }).click();
  await page.getByRole("button", { name: "کوچک‌نمایی", exact: true }).click();
  assert.ok(
    Math.abs(parseFloat(await board.evaluate((el) => el.style.width)) - 80) <
      0.01,
  );
  const scaledBefore = await item.evaluate((el) => el.style.left);
  const scaledBox = await item.boundingBox();
  await page.mouse.move(
    scaledBox.x + scaledBox.width / 2,
    scaledBox.y + scaledBox.height / 2,
  );
  await page.mouse.down();
  const held = await item.boundingBox();
  assert.ok(
    Math.abs(held.x - scaledBox.x) < 1 && Math.abs(held.y - scaledBox.y) < 1,
    "press must not displace item",
  );
  await page.mouse.move(
    scaledBox.x + scaledBox.width / 2 + 35,
    scaledBox.y + scaledBox.height / 2 + 15,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.notEqual(
    await item.evaluate((el) => el.style.left),
    scaledBefore,
    "drag works below 100% zoom",
  );
  await page.getByRole("slider", { name: "چرخش قطعه" }).fill("20");
  assert.match(
    await item.evaluate((el) => el.style.getPropertyValue("--item-rotation")),
    /20deg/,
  );
  await page.getByRole("button", { name: "بازنشانی قطعه" }).click();
  assert.match(
    await item.evaluate((el) => el.style.getPropertyValue("--item-rotation")),
    /0deg/,
  );
  await page.getByRole("button", { name: "بازنشانی بزرگ‌نمایی" }).click();
  await page.getByRole("button", { name: "بزرگ‌نمایی", exact: true }).click();
  assert.ok(
    Math.abs(parseFloat(await board.evaluate((el) => el.style.width)) - 110) <
      0.01,
  );
  await page.getByRole("button", { name: "بازنشانی بزرگ‌نمایی" }).click();
  await page.getByRole("button", { name: "پس‌زمینه تیره" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "پس‌زمینه تیره" })
      .getAttribute("aria-pressed"),
    "true",
  );
  const summary = page.locator(".sb-summary");
  await summary.getByRole("button", { name: "رنگ سبز", exact: true }).click();
  assert.equal(await item.locator("img").getAttribute("src"), greenCutout);
  await page.getByRole("button", { name: `افزودن ${name} به بوم` }).click();
  assert.equal(
    await summary
      .getByRole("button", { name: "رنگ سبز", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "reselecting a product must retain its variant",
  );
  await page.getByRole("button", { name: "تکرار قطعه" }).click();
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    2,
  );
  assert.equal(
    await board
      .getByRole("button", { name: `قطعه ${name} روی بوم`, pressed: true })
      .count(),
    1,
  );
  await summary.getByText(/از موجودی قابل افزودن بیشتر است/).waitFor();
  await summary.getByRole("button", { name: /افزودن کل ست به سبد/ }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("velours.bag.v1") || "[]").length > 0,
  );
  const bag = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("velours.bag.v1") || "[]"),
  );
  assert.equal(bag.find((v) => v.productId === id).qty, 1);
  await summary.getByRole("button", { name: "ذخیرهٔ این ست" }).click();
  await summary.getByRole("textbox", { name: "نام ست" }).fill("ست آزمون");
  await summary.getByRole("button", { name: "ذخیره", exact: true }).click();
  page.once("dialog", (d) => d.dismiss());
  await summary.getByRole("button", { name: "پاک کردن بوم" }).click();
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    2,
    "cancel clears nothing",
  );
  page.once("dialog", (d) => d.accept());
  await summary.getByRole("button", { name: "پاک کردن بوم" }).click();
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    0,
  );
  await summary.getByRole("button", { name: /^ست آزمون/ }).click();
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    2,
    "saved board restores",
  );
  await board
    .getByRole("button", { name: `قطعه ${name} روی بوم` })
    .last()
    .click();
  await page
    .getByRole("button", { name: "حذف از بوم", exact: true })
    .first()
    .click();
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    1,
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).count(),
    1,
  );
  await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).click();
  await page.getByRole("slider", { name: "اندازه قطعه" }).fill("2.4");
  await page.getByRole("slider", { name: "چرخش قطعه" }).fill("40");
  await board.getByRole("button", { name: `قطعه ${name} روی بوم` }).focus();
  for (let n = 0; n < 30; n++) {
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowUp");
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `page overflow at ${width}`,
    );
    if (width >= 768) {
      const sides = await page.evaluate(() => {
        const tray = document.querySelector(".sb-tray").getBoundingClientRect();
        const canvas = document
          .querySelector(".sb-main")
          .getBoundingClientRect();
        const side = document.querySelector(".sb-side").getBoundingClientRect();
        return {
          right: tray.left >= canvas.right,
          left: side.right <= canvas.left,
        };
      });
      assert.deepEqual(
        sides,
        { right: true, left: true },
        `side placement at ${width}`,
      );
    }
    if (width < 768) {
      const mobileLayout = await page.evaluate(() => ({
        main: document
          .querySelector(".sb-main")
          .getBoundingClientRect()
          .toJSON(),
        side: document
          .querySelector(".sb-side")
          .getBoundingClientRect()
          .toJSON(),
      }));
      assert.ok(
        mobileLayout.side.top >= mobileLayout.main.bottom,
        `summary must be below board at ${width}`,
      );
      assert.equal(
        await page.getByRole("button", { name: "امتیاز و ست" }).count(),
        0,
      );
    }
    const rects = await board.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const i = el.querySelector(".sb-canvas-item").getBoundingClientRect();
      return {
        b: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
        i: { left: i.left, right: i.right, top: i.top, bottom: i.bottom },
      };
    });
    assert.ok(
      rects.i.left >= rects.b.left - 1 &&
        rects.i.right <= rects.b.right + 1 &&
        rects.i.top >= rects.b.top - 1 &&
        rects.i.bottom <= rects.b.bottom + 1,
      `item clipped at ${width}: ${JSON.stringify(rects)}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const issues = await page.evaluate(() =>
    window.axe
      .run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
      .then((r) =>
        r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ),
  );
  assert.deepEqual(issues, []);
  const productsToggle = page.getByRole("button", {
    name: "محصولات",
    exact: true,
  });
  await productsToggle.click();
  assert.equal(await productsToggle.getAttribute("aria-expanded"), "true");
  assert.equal(
    await page.getByRole("region", { name: "محصولات برای بوم" }).isVisible(),
    true,
  );
  const productPanelIssues = await page.evaluate(() =>
    window.axe
      .run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
      .then((r) =>
        r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ),
  );
  assert.deepEqual(productPanelIssues, []);
  await page.keyboard.press("Escape");
  assert.equal(await productsToggle.getAttribute("aria-expanded"), "false");
  assert.equal(
    await productsToggle.evaluate((el) => document.activeElement === el),
    true,
  );
  await page
    .getByRole("complementary", { name: "امتیاز و خلاصه استایل" })
    .getByText("هماهنگی رنگ")
    .waitFor();
  const panelIssues = await page.evaluate(() =>
    window.axe
      .run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
      .then((r) =>
        r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ),
  );
  assert.deepEqual(panelIssues, []);
  assert.deepEqual(errors, []);
  await page.goto(`${base}/?themePreview=neo-brutalism#/style-builder`, {
    waitUntil: "networkidle",
  });
  const neoItem = page.getByRole("button", { name: `قطعه ${name} روی بوم` });
  await neoItem.scrollIntoViewIfNeeded();
  const neoBefore = await neoItem.boundingBox();
  await page.mouse.move(
    neoBefore.x + neoBefore.width / 2,
    neoBefore.y + neoBefore.height / 2,
  );
  await page.mouse.down();
  const neoHeld = await neoItem.boundingBox();
  assert.ok(
    Math.abs(neoHeld.x - neoBefore.x) < 1 &&
      Math.abs(neoHeld.y - neoBefore.y) < 1,
    "theme hover/press must not move board item",
  );
  await page.mouse.up();
  await page.goto(
    `${base}/?themePreview=neo-brutalism#/products?q=${encodeURIComponent(name)}`,
    { waitUntil: "networkidle" },
  );
  const neoCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await neoCard.getByRole("button", { name: `تصویر بعدی ${name}` }).click();
  assert.ok(
    page.url().includes("/products"),
    "theme gallery button must not open product",
  );
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 900 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobile.route("https://example.com/*.jpg", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="100%" height="100%" fill="#ddc1a4"/></svg>',
    }),
  );
  const touch = await mobile.newPage();
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(`${base}/#/products?q=${encodeURIComponent(name)}`, {
    waitUntil: "networkidle",
  });
  const touchCard = touch
    .locator("article")
    .filter({ has: touch.getByRole("heading", { name, exact: true }) });
  const touchMedia = touchCard.locator(".card-media");
  await touchMedia.scrollIntoViewIfNeeded();
  const touchImage = touchMedia.locator("img");
  assert.equal(
    await touchImage.getAttribute("src"),
    "https://example.com/one.jpg",
  );
  assert.equal(
    await touchMedia
      .getByRole("button", { name: `تصویر بعدی ${name}` })
      .evaluate((el) => getComputedStyle(el).opacity),
    "1",
  );
  const cardBox = await touchMedia.boundingBox();
  const gesture = await mobile.newCDPSession(touch);
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.2,
        y: cardBox.y + cardBox.height * 0.5,
        id: 2,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.8,
        y: cardBox.y + cardBox.height * 0.5,
        id: 2,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.waitForFunction(
    () =>
      document.querySelector(".card-media img")?.getAttribute("src") ===
      "https://example.com/two.jpg",
  );
  assert.ok(touch.url().includes("/products"), "swipe must not navigate");
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.5,
        y: cardBox.y + cardBox.height * 0.2,
        id: 3,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.5,
        y: cardBox.y + cardBox.height * 0.8,
        id: 3,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(
    await touchImage.getAttribute("src"),
    "https://example.com/two.jpg",
    "vertical swipe should not change image",
  );
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.8,
        y: cardBox.y + cardBox.height * 0.5,
        id: 4,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: cardBox.x + cardBox.width * 0.2,
        y: cardBox.y + cardBox.height * 0.5,
        id: 4,
      },
    ],
  });
  await gesture.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.waitForFunction(
    () =>
      document.querySelector(".card-media img")?.getAttribute("src") ===
      "https://example.com/one.jpg",
  );
  assert.ok(
    touch.url().includes("/products"),
    "reverse swipe must not navigate",
  );
  await gesture.detach();
  await touch.goto(`${base}/#/style-builder`, { waitUntil: "networkidle" });
  await touch.getByRole("button", { name: "محصولات", exact: true }).click();
  await touch.getByRole("button", { name: `افزودن ${name} به بوم` }).click();
  assert.equal(
    await touch
      .getByRole("button", { name: "محصولات", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  const touchBoard = touch.getByRole("region", { name: "بوم چیدمان استایل" });
  await touchBoard.scrollIntoViewIfNeeded();
  const touchItem = touchBoard.getByRole("button", {
    name: `قطعه ${name} روی بوم`,
  });
  const old = await touchItem.evaluate((el) => el.style.left);
  const box = await touchItem.boundingBox();
  const session = await mobile.newCDPSession(touch);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: box.x + box.width / 2 + 40, y: box.y + box.height / 2 + 20, id: 1 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.notEqual(
    await touchItem.evaluate((el) => el.style.left),
    old,
    "touch should drag item",
  );
  await touch.getByRole("button", { name: "محصولات", exact: true }).click();
  await touch
    .getByRole("textbox", { name: "جست‌وجوی محصول" })
    .fill(fixtures.find((f) => f.mode === "none").name);
  await touch
    .getByRole("button", {
      name: `افزودن ${fixtures.find((f) => f.mode === "none").name} به بوم`,
    })
    .click();
  await touchBoard
    .getByText("تصویر شفاف محصول برای بوم ثبت نشده است")
    .waitFor();
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "Product details RTL arrows and card sliding, keyboard and bidirectional swipe; canvas: mouse/touch drag, zoom, variants, stock-safe duplicate, persistence, five widths, side panels and axe passed.",
  );
} finally {
  await browser.close();
}
