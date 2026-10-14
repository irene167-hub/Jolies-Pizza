
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const htmlPath = path.join(__dirname, "..", "Customer", "menus.html");

function getAttribute(tag, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = tag.match(
        new RegExp("\\b" + escaped + "\\s*=\\s*([\"'])(.*?)\\1", "i")
    );
    return match ? match[2].trim() : "";
}

function getText(html, tag) {
    const match = html.match(
        new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i")
    );

    if (!match) return "";

    return match[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function parseProducts(html) {
    const cards = html.match(
        /<article\b(?=[^>]*class=["'][^"']*\bproduct-card\b[^"']*["'])[\s\S]*?<\/article>/gi
    ) || [];

    return cards.map(card => {
        const openingTag = card.match(/<article\b[^>]*>/i)?.[0] || "";
        const imageTag = card.match(/<img\b[^>]*>/i)?.[0] || "";
        const name = getAttribute(openingTag, "data-name") || getText(card, "h3");
        const category = getAttribute(openingTag, "data-category");
        const price = Number(getAttribute(openingTag, "data-price"));
        const description = getText(card, "p");
        const image = getAttribute(imageTag, "src");
        const tags = getAttribute(openingTag, "data-tags");

        if (!name || !category || !Number.isFinite(price)) {
            return null;
        }

        return {
            name,
            category,
            description,
            price,
            image,
            tags
        };
    }).filter(Boolean);
}

async function seedMenu() {
    if (!fs.existsSync(htmlPath)) {
        throw new Error(
            "Menu HTML not found: " + htmlPath +
            "\nCheck that your folder is named Customer and the file is menus.html."
        );
    }

    const html = fs.readFileSync(htmlPath, "utf8");
    const products = parseProducts(html);

    if (products.length === 0) {
        throw new Error(
            "No product cards found. Check that menus.html uses article.product-card."
        );
    }

    const categories = [...new Set(products.map(p => p.category))];

    for (const slug of categories) {
        const name = slug
            .split("-")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

        await pool.execute(
            `INSERT INTO categories (name, slug)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)`,
            [name, slug]
        );
    }

    let imported = 0;

    for (const product of products) {
        const [categoryRows] = await pool.execute(
            "SELECT id FROM categories WHERE slug = ?",
            [product.category]
        );

        if (!categoryRows.length) continue;

        await pool.execute(
            `INSERT INTO products
                (category_id, name, description, price, image_url, tags, is_available)
             VALUES (?, ?, ?, ?, ?, ?, TRUE)
             ON DUPLICATE KEY UPDATE
                category_id = VALUES(category_id),
                description = VALUES(description),
                price = VALUES(price),
                image_url = VALUES(image_url),
                tags = VALUES(tags)`,
            [
                categoryRows[0].id,
                product.name,
                product.description,
                product.price,
                product.image,
                product.tags
            ]
        );

        imported++;
    }

    console.log(`Menu import complete. Processed ${imported} products.`);
}

seedMenu()
    .catch(error => {
        console.error("Menu import failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
