#!/usr/bin/env node
/** Demo data: one admin, one supervisor, one kitchen login, 8 tables, a real menu. */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { closePool, withTransaction } from './index.js';
import { hashPassword } from '../lib/auth.js';

const rupees = (n) => Math.round(n * 100); // major -> minor units

const MENU = [
  {
    category: 'Hot Coffee', description: 'Freshly pulled espresso drinks', items: [
      { name: 'Espresso', price: 120, desc: 'A single shot of our house blend', station: 'BAR', prep: 3, variants: [['Single', 0], ['Double', 40]] },
      { name: 'Cappuccino', price: 180, desc: 'Espresso with steamed milk and a thick foam cap', station: 'BAR', prep: 5, recommended: true, variants: [['Regular', 0], ['Large', 50]], addons: [['Extra shot', 50], ['Oat milk', 30], ['Hazelnut syrup', 40]] },
      { name: 'Cafe Latte', price: 190, desc: 'Smooth espresso with plenty of steamed milk', station: 'BAR', prep: 5, variants: [['Regular', 0], ['Large', 50]], addons: [['Extra shot', 50], ['Oat milk', 30], ['Vanilla syrup', 40]] },
      { name: 'Flat White', price: 200, desc: 'Double ristretto with velvety microfoam', station: 'BAR', prep: 5, addons: [['Oat milk', 30]] },
      { name: 'Masala Chai', price: 90, desc: 'Slow-brewed with ginger, cardamom and clove', station: 'BAR', prep: 6 },
    ],
  },
  {
    category: 'Cold Brews', description: 'Iced and chilled', items: [
      { name: 'Iced Americano', price: 170, desc: 'Espresso over ice and chilled water', station: 'BAR', prep: 4 },
      { name: 'Cold Brew', price: 220, desc: 'Steeped for 18 hours, low acidity', station: 'BAR', prep: 3, recommended: true, addons: [['Vanilla cream top', 60]] },
      { name: 'Iced Mocha', price: 240, desc: 'Cold brew, chocolate and milk', station: 'BAR', prep: 5, addons: [['Whipped cream', 30]] },
      { name: 'Fresh Lime Soda', price: 110, desc: 'Sweet, salted or mixed', station: 'BAR', prep: 3, variants: [['Sweet', 0], ['Salted', 0], ['Mixed', 0]] },
    ],
  },
  {
    category: 'All Day Breakfast', description: 'Served until we close', items: [
      { name: 'Avocado Toast', price: 320, desc: 'Sourdough, smashed avocado, chilli flakes, lemon', prep: 12, recommended: true, addons: [['Poached egg', 60], ['Feta', 70]] },
      { name: 'Masala Omelette', price: 260, desc: 'Three eggs, onion, tomato, green chilli, toast', type: 'EGG', prep: 12, spice: 1 },
      { name: 'Pancake Stack', price: 300, desc: 'Buttermilk pancakes, maple syrup, butter', prep: 15, station: 'BAKERY', addons: [['Fresh berries', 90], ['Nutella', 60]] },
      { name: 'Chicken Sausage Shakshuka', price: 380, desc: 'Eggs baked in spiced tomato with sourdough', type: 'NON_VEG', prep: 18, spice: 2 },
    ],
  },
  {
    category: 'Sandwiches & Burgers', description: 'From the grill', items: [
      { name: 'Grilled Cheese Sandwich', price: 280, desc: 'Three cheeses on sourdough, with fries', prep: 12, addons: [['Extra cheese', 60], ['Jalapenos', 30]] },
      { name: 'Peri Peri Chicken Burger', price: 390, desc: 'Grilled chicken thigh, peri mayo, slaw', type: 'NON_VEG', prep: 18, spice: 2, recommended: true, addons: [['Cheese slice', 50], ['Extra patty', 140]] },
      { name: 'Paneer Tikka Wrap', price: 330, desc: 'Charred paneer, mint chutney, onions', prep: 15, spice: 1 },
      { name: 'Club Sandwich', price: 350, desc: 'Triple decker with chicken, egg and bacon', type: 'NON_VEG', prep: 15 },
    ],
  },
  {
    category: 'Bakery', description: 'Baked fresh each morning', items: [
      { name: 'Butter Croissant', price: 160, desc: 'All-butter, laminated over two days', station: 'BAKERY', prep: 2, recommended: true },
      { name: 'Pain au Chocolat', price: 180, desc: 'With dark chocolate batons', station: 'BAKERY', prep: 2 },
      { name: 'Banana Walnut Cake', price: 190, desc: 'Thick slice, lightly warmed', station: 'BAKERY', prep: 3 },
      { name: 'Blueberry Cheesecake', price: 290, desc: 'New York style with a blueberry compote', station: 'BAKERY', prep: 3, recommended: true },
      { name: 'Chocolate Chip Cookie', price: 120, desc: 'Sea salt, soft centre', station: 'BAKERY', prep: 1 },
    ],
  },
  {
    category: 'Sides', description: 'Small plates to share', items: [
      { name: 'Peri Peri Fries', price: 180, desc: 'Skin-on fries tossed in peri spice', prep: 8, spice: 2 },
      { name: 'Garlic Bread', price: 160, desc: 'With herb butter and mozzarella', prep: 10, station: 'BAKERY' },
      { name: 'Chicken Wings', price: 340, desc: 'Six pieces, buffalo or honey glaze', type: 'NON_VEG', prep: 18, spice: 2, variants: [['Buffalo', 0], ['Honey glaze', 0]] },
    ],
  },
];

async function seed() {
  await withTransaction(async (client) => {
    console.log('[seed] restaurant settings');
    await client.query(`
      UPDATE restaurant_settings
         SET name = 'Brew & Bite Cafe',
             address = '14 Church Street, Bengaluru 560001',
             phone = '+91 80 4567 8900',
             tax_label = 'GST', tax_percent = 5.00,
             service_charge_percent = 0,
             bill_footer_note = 'Thank you for visiting Brew & Bite. See you soon!'
       WHERE id = 1`);

    console.log('[seed] staff logins');
    const staff = [
      { name: 'Restaurant Admin', email: config.seed.adminEmail, password: config.seed.adminPassword, role: 'ADMIN' },
      { name: 'Ravi (Supervisor)', email: 'supervisor@restoapp.local', password: 'supervisor123', role: 'SUPERVISOR' },
      { name: 'Kitchen Display', email: 'kitchen@restoapp.local', password: 'kitchen123', role: 'KITCHEN' },
    ];
    for (const person of staff) {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role`,
        [person.name, person.email, await hashPassword(person.password), person.role],
      );
    }

    console.log('[seed] tables 1-8 with QR tokens');
    for (let i = 1; i <= 8; i += 1) {
      await client.query(
        `INSERT INTO dining_tables (code, label, seats, zone, qr_token, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
        [`T${i}`, `Table ${i}`, i <= 6 ? 4 : 6, i <= 6 ? 'Indoor' : 'Patio',
          crypto.randomBytes(12).toString('base64url'), i],
      );
    }

    console.log('[seed] menu');
    for (const [catIndex, group] of MENU.entries()) {
      const { rows: catRows } = await client.query(
        `INSERT INTO categories (name, description, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT (lower(name)) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
        [group.category, group.description, catIndex],
      );
      const categoryId = catRows[0].id;

      for (const [itemIndex, item] of group.items.entries()) {
        const { rows: itemRows } = await client.query(
          `INSERT INTO menu_items
             (category_id, name, description, price, food_type, is_recommended,
              spice_level, prep_minutes, kitchen_station, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT DO NOTHING RETURNING id`,
          [categoryId, item.name, item.desc, rupees(item.price), item.type || 'VEG',
            item.recommended || false, item.spice || 0, item.prep || 10,
            item.station || 'KITCHEN', itemIndex],
        );
        if (!itemRows[0]) continue;
        const itemId = itemRows[0].id;

        for (const [i, [name, delta]] of (item.variants || []).entries()) {
          await client.query(
            `INSERT INTO menu_item_variants (menu_item_id, name, price_delta, is_default, sort_order)
             VALUES ($1,$2,$3,$4,$5)`,
            [itemId, name, rupees(delta), i === 0, i],
          );
        }
        for (const [i, [name, price]] of (item.addons || []).entries()) {
          await client.query(
            `INSERT INTO menu_item_addons (menu_item_id, name, price, sort_order)
             VALUES ($1,$2,$3,$4)`,
            [itemId, name, rupees(price), i],
          );
        }
      }
    }
  });

  const { rows } = await (await import('./index.js')).query(
    'SELECT code, label, qr_token FROM dining_tables ORDER BY sort_order',
  );
  console.log('\n[seed] done. Scan-able table links:');
  for (const t of rows) console.log(`  ${t.code.padEnd(4)} ${config.publicWebUrl}/t/${t.qr_token}`);
  console.log(`\n  Admin      ${config.seed.adminEmail} / ${config.seed.adminPassword}`);
  console.log('  Supervisor supervisor@restoapp.local / supervisor123');
  console.log('  Kitchen    kitchen@restoapp.local / kitchen123\n');
}

seed()
  .catch((err) => { console.error('[seed] failed:', err); process.exitCode = 1; })
  .finally(closePool);
