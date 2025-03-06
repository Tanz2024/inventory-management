require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');  // For PDF parsing
const { createWorker } = require('tesseract.js');  // For OCR
const axios = require('axios');

// ---------------------------------------------------------------------
// 1) App Initialization
// ---------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT;
console.log("Hi");

// Middleware
app.use(cookieParser());
app.use(express.json());

// ---------------------------------------------------------------------
// 2) CORS Setup
// ---------------------------------------------------------------------
const corsOptions = {
  origin: 'http://localhost:3000', 
  // origin: 'https://inventory-e9c9f.web.app', // your frontend origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'ngrok-skip-browser-warning'
  ],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ---------------------------------------------------------------------
// 3) Async Handler Wrapper
// ---------------------------------------------------------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------
// 4) JWT Secret & Database Connection
// ---------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// ---------------------------------------------------------------------
// 5) Authentication Middleware
// ---------------------------------------------------------------------
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role_id !== 1) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.user = user;
    next();
  });
};

// ---------------------------------------------------------------------
// 6) Multer Setup for File Upload
// ---------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './uploads'); // Save files to 'uploads' folder
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`); // Unique filename
    },
  }),
});


// ---------------------------------------------------------------------
// 7) Authentication Routes
// ---------------------------------------------------------------------
app.get('/authenticate', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { user_id, username, role_id } = decoded;
    return res.json({ user_id, username, role_id });
  } catch (error) {
    console.error('JWT verification error:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
});

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role_id: user.role_id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Set JWT in an httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 3600000, // 1 hour
    });
    console.log("Login success");

    return res.json({
      message: 'Login successful',
      role_id: user.role_id,
      user_id: user.user_id,
      redirect: user.role_id === 1 ? '/admin-dashboard' : '/user-dashboard'
    });
  })
);

app.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'Strict',
    secure: true,
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// ---------------------------------------------------------------------
// 8) Admin Dashboard / Inventory Endpoints
// ---------------------------------------------------------------------

// 8.1) GET Non-Archived Items
app.get(
  '/admin-dashboard/items',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM items WHERE archived_at IS NULL ORDER BY item_id ASC'
      );
      res.json({ items: result.rows });
    } catch (error) {
      console.error('Error fetching items:', error);
      res.status(500).json({ message: 'Error fetching items' });
    }
  })
);

// 8.2) GET Archived Items
// app.get(
//   '/admin-dashboard/items/archive',
//   authenticateAdmin,
//   asyncHandler(async (req, res) => {
//     const result = await pool.query(
//       'SELECT * FROM items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
//     );
//     res.json({ items: result.rows });
//   })
// );
app.get(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`
    );
    res.json({ items: result.rows });
  })
);
app.post(
  '/admin-dashboard/items',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const {
      category,
      item_name,
      model,
      item_unique_id,
      quantity,
      price,
      remarks,
      site_name,
      location,
      unit
    } = req.body;

    if (!item_name || !category) {
      return res.status(400).json({ message: 'item_name and category are required.' });
    }

    // Duplicate check: if item_unique_id is provided, ensure it doesn't exist for a non-archived item.
    if (item_unique_id) {
      const { rows: duplicateRows } = await pool.query(
        'SELECT * FROM items WHERE item_unique_id = $1 AND archived_at IS NULL',
        [item_unique_id]
      );
      if (duplicateRows.length > 0) {
        return res.status(400).json({ message: 'Duplicate Unique ID detected. Please use a different Unique ID.' });
      }
    }

    // 1) Get the next item ID and display order
    const { rows: idRows } = await pool.query(`
      SELECT COALESCE(MAX(item_id), 0) AS max_id FROM items WHERE archived_at IS NULL
    `);
    const nextItemId = parseInt(idRows[0].max_id, 10) + 1;

    const { rows: maxRows } = await pool.query(`
      SELECT COALESCE(MAX(display_order), 0) AS max_order
      FROM items
      WHERE archived_at IS NULL
    `);
    const nextOrder = parseInt(maxRows[0].max_order, 10) + 1;

    // 2) Insert new item
    const insertQuery = `
      INSERT INTO items
        (item_id, category, item_name, model, item_unique_id, quantity, price,
         remarks, site_name, location, unit, display_order,
         archived_at, reserved_quantity, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         NULL, 0, NOW())
      RETURNING *;
    `;

    const values = [
      nextItemId, // Assign sequential item_id
      category,
      item_name,
      model || null,
      item_unique_id || null,
      quantity || 0,
      price || 0,
      remarks || '',
      site_name || '',
      location || '',
      unit || '',
      nextOrder
    ];

    const { rows } = await pool.query(insertQuery, values);
    const newItem = rows[0];

    // 3) Log transaction
    await pool.query(
      `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp,
           price_update, site_name, unit, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6,
           'Add Item', $7, $8, 'Approved', NOW(),
           $9, $10, $11, $12)
      `,
      [
        newItem.item_id,
        newItem.category,
        req.user.user_id,
        newItem.item_name,
        newItem.model,
        newItem.item_unique_id,
        newItem.quantity,
        newItem.remarks || '',
        newItem.price || 0,
        newItem.site_name || '',
        newItem.unit || '',
        `New item added: ${newItem.item_name}, category: ${newItem.category}.`
      ]
    );

    res.status(201).json({
      message: 'Item added successfully',
      item: newItem,
    });
  })
);
app.patch(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'No items selected for archiving' });
    }

    // Archive the selected items (set archived_at and remove display_order)
    const archiveResult = await pool.query(
      `
      UPDATE items
      SET archived_at = NOW(),
          updated_at = NOW(),
          display_order = NULL
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NULL
      RETURNING item_id, item_name, quantity, category, model, item_unique_id
      `,
      [itemIds]
    );

    // Log each archive transaction
    for (const item of archiveResult.rows) {
      await pool.query(
        `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Archive Item', -($7::integer),
           'Item archived', 'Approved', NOW(),
           'Item archived from admin dashboard.')
        `,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id,
          item.quantity || 0,
        ]
      );
    }

    // Automatically resequence the display_order for active (non-archived) items
    await pool.query(`
      WITH ordered AS (
        SELECT item_id,
               ROW_NUMBER() OVER (ORDER BY display_order) AS new_order
        FROM items
        WHERE archived_at IS NULL
      )
      UPDATE items
      SET display_order = ordered.new_order
      FROM ordered
      WHERE items.item_id = ordered.item_id;
    `);

    const archivedCount = archiveResult.rowCount;
    let message = `${archivedCount} item(s) archived successfully.`;
    if (archivedCount < itemIds.length) {
      message += ' The remaining items may already be archived or do not exist.';
    }

    return res.status(200).json({
      message,
      archivedItems: archiveResult.rows,
    });
  })
);

app.patch(
  '/admin-dashboard/items/restore',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected for restore' });
    }

    // Select only the items that are actually archived
    const itemsToRestore = await pool.query(
      `
      SELECT item_id
      FROM items
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NOT NULL
      `,
      [itemIds]
    );

    if (itemsToRestore.rowCount === 0) {
      return res.status(404).json({
        error: 'No archived items found or items already active',
      });
    }

    // Get the current highest display_order among active items
    const { rows: maxRows } = await pool.query(
      `
      SELECT COALESCE(MAX(display_order), 0) AS max_display
      FROM items
      WHERE archived_at IS NULL
      `
    );
    let currentMaxDisplay = parseInt(maxRows[0].max_display, 10);

    let restoreResult = { rows: [] };

    // For each archived item, update it as active and assign a new display_order
    for (const itemId of itemIds) {
      currentMaxDisplay++;
      const partialResult = await pool.query(
        `
        UPDATE items
        SET archived_at = NULL,
            updated_at = NOW(),
            display_order = $2
        WHERE item_id = $1
          AND archived_at IS NOT NULL
        RETURNING item_id, item_name, quantity, category, model, item_unique_id, display_order
        `,
        [itemId, currentMaxDisplay]
      );
      restoreResult.rows.push(...partialResult.rows);
    }

    // Log each restore transaction
    for (const item of restoreResult.rows) {
      await pool.query(
        `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Restore Item', $7,
           'Item restored back to dashboard', 'Approved', NOW(),
           'Item restored from archive to dashboard.')
        `,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id,
          item.quantity || 0,
        ]
      );
    }

    // Automatically resequence the display_order after restoration
    await pool.query(`
      WITH ordered AS (
        SELECT item_id,
               ROW_NUMBER() OVER (ORDER BY display_order) AS new_order
        FROM items
        WHERE archived_at IS NULL
      )
      UPDATE items
      SET display_order = ordered.new_order
      FROM ordered
      WHERE items.item_id = ordered.item_id;
    `);

    return res.status(200).json({
      message: `${restoreResult.rows.length} item(s) restored successfully`,
      restoredItems: restoreResult.rows,
    });
  })
);
app.patch(
  '/admin-dashboard/items/fix-item-ids',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Shift archived items away by adding a large offset.
      const shiftArchivedQuery = `
        UPDATE items
        SET item_id = item_id + 1000000
        WHERE archived_at IS NOT NULL;
      `;
      console.log('Executing shiftArchived query:', shiftArchivedQuery);
      await client.query(shiftArchivedQuery);

      // Step 2: For active items (archived_at IS NULL), assign temporary negative IDs based on desired order.
      const tempUpdateQuery = `
        WITH ordered AS (
          SELECT item_id,
                 ROW_NUMBER() OVER (ORDER BY CASE WHEN starred THEN 0 ELSE 1 END, item_id) AS new_id
          FROM items
          WHERE archived_at IS NULL
        )
        UPDATE items
        SET item_id = -ordered.new_id
        FROM ordered
        WHERE items.item_id = ordered.item_id
          AND archived_at IS NULL;
      `;
      console.log('Executing temporary update query:', tempUpdateQuery);
      await client.query(tempUpdateQuery);

      // Step 3: Convert negative IDs to positive.
      const finalUpdateQuery = `
        UPDATE items
        SET item_id = ABS(item_id)
        WHERE archived_at IS NULL;
      `;
      console.log('Executing final update query:', finalUpdateQuery);
      await client.query(finalUpdateQuery);

      await client.query('COMMIT');
      console.log('Item IDs fixed successfully.');
      return res.status(200).json({ message: 'Item IDs fixed successfully.' });
    } catch (error) {
      console.error('Failed to fix item IDs:', error);
      await client.query('ROLLBACK');
      return res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  })
);



app.delete(
  '/admin-dashboard/items/permanent',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'No items selected for permanent deletion' });
    }

    // Backup category, name, and model in `inventory_transactions`
    await pool.query(`
      UPDATE inventory_transactions it
      SET 
        category = i.category,
        item_name = i.item_name,
        model = i.model
      FROM items i
      WHERE it.item_id = i.item_id AND it.item_id = ANY($1::int[]);
    `, [itemIds]);

    // Check if items are archived first
    const archivedCheck = await pool.query(
      `SELECT item_id FROM items
       WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL`,
      [itemIds]
    );
    if (archivedCheck.rowCount === 0) {
      return res
        .status(400)
        .json({ error: 'No archived items found to permanently delete' });
    }

    // Physically remove them
    const deleteQuery = `
      DELETE FROM items
      WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL
      RETURNING item_id, item_name, category, model, item_unique_id;
    `;
    const deleteResult = await pool.query(deleteQuery, [itemIds]);

    // Log permanent deletion for each deleted item
    for (const item of deleteResult.rows) {
      await pool.query(
        `INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
         VALUES
          ($1, $2, $3, $4, $5, $6, 'Permanent Delete', 0,
           'Item permanently deleted from archive', 'Approved', NOW(),
           'Item permanently deleted.')`,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id
        ]
      );
    }

    res.status(200).json({
      message: `${deleteResult.rowCount} archived item(s) permanently deleted`,
      deletedItems: deleteResult.rows,
    });
  })
);


// 8.7) PATCH Single Item (Combined Update)
app.patch(
  '/admin-dashboard/items/:itemId/update',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    // Destructure starred along with the other fields
    const { price, remarks, quantityChange, newQuantity, site_name, unit, item_unique_id, audit_date, starred } = req.body;

    // Only admins can update the price
    if (req.body.hasOwnProperty('price') && price !== undefined && req.user.role_id !== 1) {
      return res.status(400).json({ message: 'Non-admin users cannot update price.' });
    }

    // Fetch current item
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM items WHERE item_id = $1',
      [itemId]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ message: 'Item not found.' });
    }
    const currentItem = itemRows[0];

    // --- Process Unique ID Update ---
    let updatedUniqueId = currentItem.item_unique_id;
    let isUniqueIdUpdated = false;
    if (req.body.hasOwnProperty('item_unique_id')) {
      if (item_unique_id !== currentItem.item_unique_id) {
        const { rows: duplicateRows } = await pool.query(
          'SELECT * FROM items WHERE item_unique_id = $1 AND item_id <> $2',
          [item_unique_id, itemId]
        );
        if (duplicateRows.length > 0) {
          return res.status(400).json({ message: 'Duplicate Unique ID detected.' });
        }
        updatedUniqueId = item_unique_id;
        isUniqueIdUpdated = true;
      }
    }

    // Set defaults from current item for other fields
    let updatedQuantity = currentItem.quantity;
    let updatedPrice = currentItem.price;
    const updatedSiteName = req.body.hasOwnProperty('site_name') ? site_name : currentItem.site_name;
    const updatedUnit = req.body.hasOwnProperty('unit') ? unit : currentItem.unit;

    // Process Audit Date update
    let updatedAuditDate = currentItem.audit_date;
    let isAuditDateUpdated = false;
    if (req.body.hasOwnProperty('audit_date')) {
      if (audit_date !== currentItem.audit_date) {
        updatedAuditDate = audit_date;
        isAuditDateUpdated = true;
      }
    }

    // Process Starred update
    let updatedStarred = currentItem.starred;
    let isStarredUpdated = false;
    if (req.body.hasOwnProperty('starred')) {
      if (starred !== currentItem.starred) {
        updatedStarred = starred;
        isStarredUpdated = true;
      }
    }

    // Flags to determine which fields have been updated
    let isQuantityUpdated = false;
    let isPriceUpdated = false;
    let isSiteUpdated = false;
    let isRemarksUpdated = false;
    let isUnitUpdated = false;

    // Array to hold individual change messages
    const changeLogs = [];

    // Process quantity update (only if provided)
    if (req.body.hasOwnProperty('newQuantity')) {
      const parsedNewQty = parseInt(newQuantity, 10);
      if (isNaN(parsedNewQty)) {
        return res.status(400).json({ message: 'Invalid new quantity value.' });
      }
      if (parsedNewQty < 0) {
        return res.status(400).json({ message: 'Quantity cannot be negative.' });
      }
      updatedQuantity = parsedNewQty;
      if (updatedQuantity !== currentItem.quantity) {
        isQuantityUpdated = true;
        changeLogs.push(`Quantity updated from ${currentItem.quantity} to ${updatedQuantity}`);
      }
    } else if (req.body.hasOwnProperty('quantityChange')) {
      const parsedChange = parseInt(quantityChange, 10);
      if (isNaN(parsedChange)) {
        return res.status(400).json({ message: 'Invalid quantity change.' });
      }
      if (parsedChange !== 0) {
        updatedQuantity = currentItem.quantity + parsedChange;
        if (updatedQuantity < 0) {
          return res.status(400).json({ message: 'Insufficient stock.' });
        }
        isQuantityUpdated = true;
        changeLogs.push(`Quantity changed from ${currentItem.quantity} to ${updatedQuantity} (Change: ${parsedChange})`);
      }
    }

    // Process price update
    if (req.body.hasOwnProperty('price')) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price value.' });
      }
      if (parsedPrice !== parseFloat(currentItem.price)) {
        updatedPrice = parsedPrice;
        isPriceUpdated = true;
        changeLogs.push(`Price updated from RM ${currentItem.price} to RM ${updatedPrice}`);
      }
    }

    // Process site name update
    if (req.body.hasOwnProperty('site_name') && site_name !== currentItem.site_name) {
      isSiteUpdated = true;
      changeLogs.push(`Site name updated from "${currentItem.site_name}" to "${updatedSiteName}"`);
    }

    // Process remarks update
    if (req.body.hasOwnProperty('remarks') && remarks !== currentItem.remarks) {
      isRemarksUpdated = true;
      changeLogs.push(`Remarks updated from "${currentItem.remarks || 'N/A'}" to "${remarks}"`);
    }

    // Process unit update
    if (req.body.hasOwnProperty('unit') && unit !== currentItem.unit) {
      isUnitUpdated = true;
      changeLogs.push(`Unit updated from "${currentItem.unit}" to "${updatedUnit}"`);
    }

    // Process audit date update
    if (isAuditDateUpdated) {
      changeLogs.push(`Audit date updated from "${currentItem.audit_date || 'N/A'}" to "${updatedAuditDate}"`);
    }

    // Process starred update log if applicable
    if (isStarredUpdated) {
      changeLogs.push(`Starred status updated from "${currentItem.starred}" to "${updatedStarred}"`);
    }

    // If no changes detected, return early without logging
    if (
      !isQuantityUpdated &&
      !isPriceUpdated &&
      !isSiteUpdated &&
      !isRemarksUpdated &&
      !isUnitUpdated &&
      !isUniqueIdUpdated &&
      !isAuditDateUpdated &&
      !isStarredUpdated
    ) {
      return res.json({
        message: 'No changes detected.',
        item: currentItem
      });
    }

    // Log changes
    if (changeLogs.length === 1) {
      console.log(`INFO: Item ${itemId} - ${changeLogs[0]}.`);
    } else {
      console.log(`INFO: Item ${itemId} - Combined Update: ${changeLogs.join('; ')}.`);
    }

    // Update the item record (including the unique id, audit_date, and starred fields)
    const updateQuery = `
      UPDATE items
      SET
        remarks = $1,
        quantity = $2,
        price = $3,
        site_name = $4,
        unit = $5,
        item_unique_id = $6,
        audit_date = $7,
        starred = $8,
        updated_at = NOW()
      WHERE item_id = $9
      RETURNING *;
    `;
    const { rows: updatedRows } = await pool.query(updateQuery, [
      req.body.hasOwnProperty('remarks') ? remarks : currentItem.remarks,
      updatedQuantity,
      req.body.hasOwnProperty('price') ? updatedPrice : currentItem.price,
      updatedSiteName,
      updatedUnit,
      updatedUniqueId,
      req.body.hasOwnProperty('audit_date') ? updatedAuditDate : currentItem.audit_date,
      updatedStarred,
      itemId
    ]);
    const updatedItem = updatedRows[0];

    // Build overall change summary string
    let changeSummary = changeLogs.join('. ') + '.';

    // Determine transaction type based on changes
    const changesCount = [
      isQuantityUpdated,
      isPriceUpdated,
      isSiteUpdated,
      isRemarksUpdated,
      isUnitUpdated,
      isUniqueIdUpdated,
      isAuditDateUpdated,
      isStarredUpdated
    ].filter(Boolean).length;
    let transactionType;
    if (changesCount > 1) {
      transactionType = 'Combined Update';
    } else if (isQuantityUpdated) {
      transactionType = req.body.hasOwnProperty('newQuantity')
        ? 'Quantity Value Update'
        : (parseInt(quantityChange, 10) > 0 ? 'Add' : 'Subtract');
    } else if (isPriceUpdated) {
      transactionType = 'Price Update';
    } else if (isSiteUpdated) {
      transactionType = 'Site Update';
    } else if (isRemarksUpdated) {
      transactionType = 'Remarks Update';
    } else if (isUnitUpdated) {
      transactionType = 'Unit Update';
    } else if (isUniqueIdUpdated) {
      transactionType = 'Unique ID Update';
    } else if (isAuditDateUpdated) {
      transactionType = 'Audit Date Update';
    } else if (isStarredUpdated) {
      transactionType = 'Starred Update';
    } else {
      transactionType = 'Inventory Update';
    }

    console.log(`INFO: Item ${itemId} - Overall Change Summary: ${changeSummary}`);

    // Insert record into inventory_transactions
    await pool.query(
      `
        INSERT INTO inventory_transactions
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update, site_name, unit, change_summary)
        VALUES
          ($1, $2, $3, $4, NOW(), $5, 'Approved', $6, $7, $8, $9)
      `,
      [
        itemId,
        req.user.user_id,
        transactionType,
        isQuantityUpdated
          ? req.body.hasOwnProperty('newQuantity')
            ? Math.abs(parseInt(newQuantity, 10))
            : Math.abs(parseInt(quantityChange, 10))
          : 0,
        req.body.hasOwnProperty('remarks') ? remarks : currentItem.remarks,
        isPriceUpdated ? updatedPrice : null,
        updatedSiteName,
        updatedUnit,
        changeSummary
      ]
    );

    return res.json({
      message: 'Item updated successfully.',
      item: updatedItem,
      changeSummary
    });
  })
);



// Reserve an item: update stock, log transaction, and create a reservation record
app.patch(
  '/admin-dashboard/items/:itemId/reserve',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { quantityToReserve, remarks } = req.body; // quantityToReserve can now be positive or negative
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    // Validate that quantityToReserve is an integer (allowing negative numbers)
    if (!Number.isInteger(quantityToReserve)) {
      return res
        .status(400)
        .json({ message: 'Quantity to reserve must be an integer.' });
    }

    try {
      // Begin transaction
      await pool.query('BEGIN');

      // Lock and fetch the current item data
      const itemResult = await pool.query(
        'SELECT * FROM items WHERE item_id = $1 FOR UPDATE',
        [itemId]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found.' });
      }
      const currentItem = itemResult.rows[0];

      // If quantityToReserve is positive, ensure there is enough stock.
      // If negative, ensure there is enough reserved stock to reduce.
      if (quantityToReserve > 0 && currentItem.quantity < quantityToReserve) {
        await pool.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Not enough stock available to reserve.' });
      }
      if (quantityToReserve < 0 && currentItem.reserved_quantity < Math.abs(quantityToReserve)) {
        await pool.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Not enough reserved stock available to release.' });
      }

      // Calculate new quantities:
      // For a positive quantity, available stock decreases and reserved increases.
      // For a negative quantity, available stock increases and reserved decreases.
      const newQuantity = currentItem.quantity - quantityToReserve;
      const newReservedQuantity = currentItem.reserved_quantity + quantityToReserve;

      // Update the item in the database
      const updateResult = await pool.query(
        'UPDATE items SET quantity = $1, reserved_quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
        [newQuantity, newReservedQuantity, itemId]
      );
      const updatedItem = updateResult.rows[0];

      // Determine transaction type based on quantity sign
      const transactionType = quantityToReserve >= 0 ? 'Reserve' : 'Reserve Reduction';

      // Log the transaction for the reserve operation
      const logResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, category, user_id, item_name, model, item_unique_id, transaction_type, quantity_change, remarks, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          itemId,
          currentItem.category,
          userId,
          currentItem.item_name,
          currentItem.model,
          currentItem.item_unique_id,
          transactionType,
          quantityToReserve,
          remarks,
          status,
        ]
      );
      const logEntry = logResult.rows[0];

      // Create a reservation record.
      // For positive adjustments, this creates a new reservation.
      // For negative adjustments, it records the reduction.
      const reservationResult = await pool.query(
        `INSERT INTO reservations 
           (item_id, item_name, model, item_unique_id, category, reserved_quantity, status, reservation_status, reserved_at, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'In Progress', NOW(), $8)
         RETURNING *`,
        [
          itemId,
          currentItem.item_name,
          currentItem.model,
          currentItem.item_unique_id,
          currentItem.category,
          quantityToReserve,
          status,
          remarks || '',
        ]
      );
      const reservationEntry = reservationResult.rows[0];

      // Commit the transaction
      await pool.query('COMMIT');

      res.json({
        message: 'Reservation operation completed successfully.',
        item: updatedItem,
        reservation: reservationEntry,
        log: logEntry,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error during item reservation operation:', error);
      res
        .status(500)
        .json({ message: 'An error occurred while processing the reservation operation.' });
    }
  })
);


// Get all reservations with status "In Progress"
app.get(
  '/admin-dashboard/items/reservations',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM reservations WHERE reservation_status = 'In Progress'"
      );
      res.json({ items: result.rows });
    } catch (error) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({
        message: 'An error occurred while fetching the reservations.',
      });
    }
  })
);

app.patch(
  '/admin-dashboard/items/:reservationId/complete',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    try {
      console.log(`🔍 Processing reservation completion for ID: ${reservationId}`);

      await pool.query('BEGIN');

      // Update reservation status
      const resUpdate = await pool.query(
        `UPDATE reservations 
         SET reservation_status = $1, updated_at = NOW()
         WHERE reservation_id = $2
         RETURNING *`,
        ['Completed', reservationId]
      );

      if (resUpdate.rowCount === 0) {
        console.error(`❌ ERROR: Reservation ID ${reservationId} not found.`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Reservation not found' });
      }

      const updatedReservation = resUpdate.rows[0];
      console.log(`✅ Reservation ${reservationId} marked as Completed.`);

      if (!updatedReservation.item_id) {
        console.error(`❌ ERROR: Reservation ${reservationId} has no valid item_id.`);
        await pool.query('ROLLBACK');
        return res.status(500).json({ message: 'Invalid reservation data - missing item_id' });
      }

      // Fetch item details
      const itemRes = await pool.query(
        `SELECT item_id, item_name, category, model, reserved_quantity, item_unique_id 
         FROM items 
         WHERE item_id = $1 FOR UPDATE`,
        [updatedReservation.item_id]
      );

      if (itemRes.rowCount === 0) {
        console.error(`❌ ERROR: Item ID ${updatedReservation.item_id} not found.`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found' });
      }

      const itemDetails = itemRes.rows[0];

      // Ensure reserved_quantity is valid
      const currentReserved = itemDetails.reserved_quantity || 0;
      const reservationReserved = updatedReservation.reserved_quantity || 0;
      const newReservedQuantity = currentReserved - reservationReserved;

      console.log(`📊 Adjusting reserved quantity: ${currentReserved} - ${reservationReserved} = ${newReservedQuantity}`);

      // Log transaction
      const transResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp, model, item_name, category, item_unique_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
         RETURNING *`,
        [
          updatedReservation.item_id,
          userId,
          'Reserve Complete',
          reservationReserved,
          by || 'Reservation completed',
          status,
          itemDetails.model,
          itemDetails.item_name,
          itemDetails.category,
          itemDetails.item_unique_id,
        ]
      );

      console.log(`✅ Transaction logged for Item ID ${updatedReservation.item_id}`);

      // Update item's reserved quantity
      const itemUpdate = await pool.query(
        `UPDATE items 
         SET reserved_quantity = $1, updated_at = NOW()
         WHERE item_id = $2
         RETURNING *`,
        [newReservedQuantity, updatedReservation.item_id]
      );

      if (itemUpdate.rowCount === 0) {
        console.error(`❌ ERROR: Failed to update reserved quantity for Item ID ${updatedReservation.item_id}`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Failed to update item reserved quantity' });
      }

      await pool.query('COMMIT');

      res.json({
        message: 'Reservation completed successfully and transaction logged.',
        reservation: updatedReservation,
        transaction: transResult.rows[0],
        updatedItem: itemUpdate.rows[0],
      });

      console.log(`✅ Reservation ${reservationId} successfully completed.`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('🚨 ERROR Completing Reservation:', error);
      res.status(500).json({ message: 'An error occurred while completing the reservation.' });
    }
  })
);



// Cancel a reservation: update reservation status to Canceled, restore item quantity, and log a cancellation transaction
app.patch(
  '/admin-dashboard/items/:reservationId/cancel',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    try {
      await pool.query('BEGIN');

      // Lock and fetch the reservation record
      const reservationResult = await pool.query(
        'SELECT item_id, reserved_quantity FROM reservations WHERE reservation_id = $1 FOR UPDATE',
        [reservationId]
      );
      if (reservationResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Reservation not found' });
      }
      const { item_id, reserved_quantity } = reservationResult.rows[0];

      // Lock and fetch the associated item record
      const itemResult = await pool.query(
        'SELECT quantity, reserved_quantity, item_name, category, model, item_unique_id FROM items WHERE item_id = $1 FOR UPDATE',
        [item_id]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found' });
      }
      const {
        quantity,
        reserved_quantity: currentReservedQuantity,
        item_name,
        category,
        model,
        item_unique_id,
      } = itemResult.rows[0];

      // Calculate updated stock values
      const updatedReservedQuantity = currentReservedQuantity - reserved_quantity;
      const updatedQuantity = quantity + reserved_quantity;

      // Update the item record
      const updateItem = await pool.query(
        'UPDATE items SET reserved_quantity = $1, quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
        [updatedReservedQuantity, updatedQuantity, item_id]
      );
      if (updateItem.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Failed to update item stock' });
      }
      const updatedItem = updateItem.rows[0];

      // Log the "Reserve Cancel" transaction
      const transactionResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp, model, item_name, category, item_unique_id)
         VALUES ($1, $2, 'Reserve Cancel', $3, $4, $5, NOW(), $6, $7, $8, $9)
         RETURNING *`,
        [
          item_id,
          userId,
          reserved_quantity,
          by || 'Reservation canceled',
          status,
          model,
          item_name,
          category,
          item_unique_id,
        ]
      );
      const transactionEntry = transactionResult.rows[0];

      // Update the reservation status to Canceled
      const updateReservation = await pool.query(
        'UPDATE reservations SET reservation_status = $1, updated_at = NOW() WHERE reservation_id = $2 RETURNING *',
        ['Canceled', reservationId]
      );
      if (updateReservation.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Failed to update reservation status' });
      }
      const updatedReservation = updateReservation.rows[0];

      await pool.query('COMMIT');

      res.json({
        message: 'Reservation canceled successfully, transaction logged.',
        item: updatedItem,
        reservation: updatedReservation,
        transaction: transactionEntry,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error canceling reservation:', error);
      res.status(500).json({
        message: 'An error occurred while canceling the reservation.',
      });
    }
  })
);

// ---------------------------------------------------------------------
// 10) Logs & Pending Transactions
// ---------------------------------------------------------------------
app.get(
  '/logs',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const query = `
      SELECT
        it.transaction_id,
        it.item_id,
        COALESCE(it.category, i.category) AS category,  -- Use transaction data if available
        COALESCE(it.item_name, i.item_name) AS item_name,
        COALESCE(it.model, i.model) AS model,
        i.item_unique_id,
        it.site_name,
        u.username AS updated_by,
        it.transaction_type,
        it.quantity_change,
        it.unit,
        it.price_update,
        it.timestamp,
        i.item_unique_id,
        it.remarks,
        it.status,
        it.change_summary
      FROM inventory_transactions it
      LEFT JOIN items i ON it.item_id = i.item_id
      LEFT JOIN users u ON it.user_id = u.user_id
      ORDER BY it.timestamp DESC;
    `;

    const { rows } = await pool.query(query);
    res.json({ logs: rows });
  })
);


app.get(
  '/pending-transactions',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const query = `
      SELECT
        it.transaction_id,
        it.item_id,
        i.category,
        i.item_name,
        i.model,
        i.item_unique_id,
        it.user_id,
        it.transaction_type,
        it.quantity_change,
        it.timestamp,
        it.remarks,
        it.status
      FROM inventory_transactions it
      JOIN items i ON it.item_id = i.item_id
      WHERE it.status = 'Pending'
      ORDER BY it.timestamp DESC;
    `;
    const { rows } = await pool.query(query);
    res.json({ pendingTransactions: rows });
  })
);

app.patch(
  '/approve-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const result = await pool.query(
      `UPDATE inventory_transactions
       SET status = 'Approved'
       WHERE transaction_id = $1 AND status = 'Pending'
       RETURNING *`,
      [transactionId]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Transaction not found or already approved.' });
    }
    res.json({
      message: 'Transaction approved successfully.',
      transaction: result.rows[0],
    });
  })
);

app.patch(
  '/cancel-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const result = await pool.query(
      `UPDATE inventory_transactions
       SET status = 'Cancelled'
       WHERE transaction_id = $1 AND status = 'Pending'
       RETURNING *`,
      [transactionId]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Transaction not found or already processed.' });
    }
    res.json({
      message: 'Transaction cancelled successfully.',
      transaction: result.rows[0],
    });
  })
);

// ---------------------------------------------------------------------
// 11) File Upload & OCR Placeholder
// ---------------------------------------------------------------------
app.post(
  '/api/uploadFiles',
  upload.array('files'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
      }
      const siteName = req.body.siteName || null;
      for (const file of req.files) {
        const fileName = file.originalname;
        const fileData = fs.readFileSync(file.path);
        const fileType = path.extname(file.originalname).toLowerCase();
        const status = 'Pending';

    

        await pool.query(
          `INSERT INTO uploaded_files
            (file_name, file_data, file_type, status, site_name, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [fileName, fileData, fileType, status, siteName]
        );
      }
      res.json({
        message: 'Files uploaded (with optional OCR) and saved to database successfully.',
      });
    } catch (error) {
      console.error('Error during file upload:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  })
);

app.get(
  '/api/fileHistory',
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, file_name, file_type, status, site_name AS "siteName", uploaded_at
         FROM uploaded_files
         ORDER BY uploaded_at DESC`
      );
      res.json({ files: result.rows });
    } catch (error) {
      console.error('Error fetching file history:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  })
);

app.get(
  '/api/filePreview/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT file_data, file_type FROM uploaded_files WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    const { file_data, file_type } = result.rows[0];
    let mimeType = 'application/octet-stream';
    if (file_type === '.pdf') {
      mimeType = 'application/pdf';
    } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(file_type)) {
      mimeType = `image/${file_type.slice(1)}`;
    }
    res.setHeader('Content-Type', mimeType);
    res.send(file_data);
  })
);

app.delete(
  '/api/deleteFile/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM uploaded_files WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'File not found or already deleted.' });
    }
    res.json({
      message: 'File deleted successfully.',
      file: result.rows[0],
    });
  })
);

app.put(
  '/api/updateFile/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { file_name, status, site_name } = req.body;
    if (!file_name || !status) {
      return res
        .status(400)
        .json({ message: 'file_name and status are required.' });
    }
    const siteNameValue = site_name || null;
    const result = await pool.query(
      `UPDATE uploaded_files
       SET file_name = $1,
           status = $2,
           site_name = $3,
           uploaded_at = NOW()
       WHERE id = $4
       RETURNING id, file_name, file_type, status, site_name AS "siteName", uploaded_at`,
      [file_name, status, siteNameValue, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'File not found.' });
    }
    res.json({
      message: 'File updated successfully.',
      file: result.rows[0],
    });
  })
);

// ---------------------------------------------------------------------
// 12) Inventory Update Endpoints (Delivery/GoodsReceived)
// ---------------------------------------------------------------------
app.post(
  '/delivery/update-inventory',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ message: 'Invalid payload: items array required.' });
    }
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query(
        'SELECT quantity FROM items WHERE item_id = $1',
        [itemId]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity - Number(qty);
      if (newQuantity < 0) {
        return res.status(400).json({
          message: `Insufficient quantity for item with id ${itemId}.`,
        });
      }
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({ message: 'Inventory updated successfully.' });
  })
);

app.post(
  '/goodsreceived/update-inventory',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ message: 'Invalid payload: items array required.' });
    }
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query(
        'SELECT quantity FROM items WHERE item_id = $1',
        [itemId]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity + Number(qty);
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({
      message: 'Inventory updated successfully after goods received.',
    });
  })
);


app.post('/upload', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  try {
    const summaries = await Promise.all(
      req.files.map(async (file) => {
        const filePath = file.path;
        const fileExtension = path.extname(file.originalname).toLowerCase();
        let wordsArray;

        if (fileExtension === '.pdf') {
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          wordsArray = pdfData.text.split(/\s+/);
        } else {
          wordsArray = await performOCR(filePath); // Assume performOCR is defined elsewhere
        }

        const gptRequestBody = JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `(This is my OCR results: ${wordsArray}) Extract System Devices, ID, and Qty. (System Devices must be only words, ID must have 5 characters only, Qty just numbers.) Return results in JSON format: [{"system_devices": "Device1", "id": "deviceId", "qty": qty}]`
            },
          ],
          temperature: 0.7,
          max_tokens: 600,
        });



        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, // Ensure this is a valid API key
            'Content-Type': 'application/json',
          },
          body: gptRequestBody,
        });

        if (!gptResponse.ok) {
          const errorDetails = await gptResponse.text();
          console.error('GPT API response:', errorDetails);
          throw new Error(`GPT API error: ${gptResponse.statusText}`);
        }

        const gptData = await gptResponse.json();

        return {
          gptSummary: gptData.choices[0].message.content.trim(),
        };
      })
    );

    res.json({ summaries });
  } catch (error) {
    console.error('Error during OCR/GPT process:', error);
    res.status(500).send('Error processing the files.');
  }
});
// ---------------------------------------------------------------------
// 13) Start the Server
// ---------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Server running on port ${PORT}`)
);
