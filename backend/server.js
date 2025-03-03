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
  origin: 'http://localhost:3000', // your frontend origin
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
app.get(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
    );
    res.json({ items: result.rows });
  })
);
// 8.3) ADD ITEM – Immediately appear in dashboard
// app.post(
//   '/admin-dashboard/items',
//   authenticateAdmin,
//   asyncHandler(async (req, res) => {
//     const {
//       category,
//       item_name,
//       model,
//       item_unique_id,
//       quantity,
//       price,
//       remarks,
//       site_name,
//       location,
//       unit
//     } = req.body;

//     if (!item_name || !category) {
//       return res.status(400).json({ message: 'item_name and category are required.' });
//     }

//     // Get the current maximum display_order for active items
//     const { rows: maxRows } = await pool.query(
//       `SELECT COALESCE(MAX(display_order), 0) as max_order FROM items WHERE archived_at IS NULL`
//     );
//     const nextOrder = parseInt(maxRows[0].max_order, 10) + 1;

//     const insertQuery = `
//       INSERT INTO items
//         (category, item_name, model, item_unique_id, quantity, price, remarks, site_name, location, unit, display_order, archived_at, reserved_quantity, updated_at)
//       VALUES
//         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, 0, NOW())
//       RETURNING *;
//     `;
//     const values = [
//       category,
//       item_name,
//       model || null,
//       item_unique_id || null,
//       quantity || 0,
//       price || 0,
//       remarks || '',
//       site_name || '',
//       location || '',
//       unit || '',
//       nextOrder
//     ];

//     const { rows } = await pool.query(insertQuery, values);
//     const newItem = rows[0];

//     // Log "Add Item"
//     await pool.query(
//       `INSERT INTO inventory_transactions
//          (item_id, category, user_id, item_name, model, item_unique_id, transaction_type, quantity_change, remarks, status, timestamp, price_update, site_name, change_summary)
//        VALUES
//          ($1, $2, $3, $4, $5, $6, 'Add Item', $7, $8, 'Approved', NOW(), $9, $10, $11)`,
//       [
//         newItem.item_id,
//         newItem.category,
//         req.user.user_id,
//         newItem.item_name,
//         newItem.model,
//         newItem.item_unique_id,
//         newItem.quantity,
//         newItem.remarks || '',
//         newItem.price || 0,
//         newItem.site_name || '',
//         `New item added: ${newItem.item_name}, category: ${newItem.category}. Unit: ${newItem.unit}`
//       ]
//     );

//     res.status(201).json({
//       message: 'Item added successfully',
//       item: newItem,
//     });
//   })
// );


// app.patch(
//   '/admin-dashboard/items/archive',
//   authenticateAdmin,
//   asyncHandler(async (req, res) => {
//     const { itemIds } = req.body;

//     if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
//       return res.status(400).json({ message: 'No items selected for archiving' });
//     }

//     // Archive items: set archived_at to NOW() and clear display_order
//     const archiveResult = await pool.query(
//       `UPDATE items
//          SET archived_at = NOW(), updated_at = NOW(), display_order = NULL
//          WHERE item_id = ANY($1::int[]) AND archived_at IS NULL
//          RETURNING item_id, item_name, quantity, category, model, item_unique_id`,
//       [itemIds]
//     );

//     // Recalculate display_order for remaining active items
//     await pool.query(`
//       WITH Ordered AS (
//         SELECT item_id, ROW_NUMBER() OVER (ORDER BY item_id ASC) as new_order
//         FROM items
//         WHERE archived_at IS NULL
//       )
//       UPDATE items i
//       SET display_order = o.new_order
//       FROM Ordered o
//       WHERE i.item_id = o.item_id;
//     `);

//     const archivedCount = archiveResult.rowCount;
//     const requestedCount = itemIds.length;
//     let message = `${archivedCount} item(s) archived successfully.`;
//     if (archivedCount < requestedCount) {
//       message += ` The remaining items may already be archived or do not exist.`;
//     }

//     // Log transactions for each archived item
//     for (const item of archiveResult.rows) {
//       await pool.query(
//         `INSERT INTO inventory_transactions
//            (item_id, category, user_id, item_name, model, item_unique_id,
//             transaction_type, quantity_change, remarks, status, timestamp, change_summary)
//          VALUES
//            ($1, $2, $3, $4, $5, $6, 'Archive Item', -($7::integer), 'Item archived', 'Approved', NOW(), 'Item archived from admin dashboard.')`,
//         [
//           item.item_id,
//           item.category,
//           req.user.user_id,
//           item.item_name,
//           item.model,
//           item.item_unique_id,
//           item.quantity || 0,
//         ]
//       );
//     }

//     return res.status(200).json({
//       message,
//       archivedItems: archiveResult.rows,
//     });
//   })
// );



// app.patch(
//   '/admin-dashboard/items/restore',
//   authenticateAdmin,
//   asyncHandler(async (req, res) => {
//     const { itemIds } = req.body;
//     if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
//       return res.status(400).json({ error: 'No items selected for restore' });
//     }

//     // Ensure items are archived
//     const itemsToRestore = await pool.query(
//       `SELECT item_id FROM items
//        WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL`,
//       [itemIds]
//     );
//     if (itemsToRestore.rowCount === 0) {
//       return res.status(404).json({
//         error: 'No archived items found or items already active',
//       });
//     }

//     // Get the current maximum display_order among active items
//     const { rows: maxRows } = await pool.query(
//       `SELECT COALESCE(MAX(display_order), 0) as max_order FROM items WHERE archived_at IS NULL`
//     );
//     const newOrder = parseInt(maxRows[0].max_order, 10) + 1;

//     // Restore items: set archived_at = NULL and assign new display_order
//     const restoreResult = await pool.query(
//       `UPDATE items
//          SET archived_at = NULL, updated_at = NOW(), display_order = $2
//          WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL
//          RETURNING item_id, item_name, quantity, category, model, item_unique_id, display_order`,
//       [itemIds, newOrder]
//     );

//     // Log a transaction for each restored item
//     for (const item of restoreResult.rows) {
//       await pool.query(
//         `INSERT INTO inventory_transactions
//            (item_id, category, user_id, item_name, model, item_unique_id,
//             transaction_type, quantity_change, remarks, status, timestamp, change_summary)
//          VALUES
//            ($1, $2, $3, $4, $5, $6, 'Restore Item', $7,
//             'Item restored back to dashboard', 'Approved', NOW(), 'Item restored from archive to dashboard.')`,
//         [
//           item.item_id,
//           item.category,
//           req.user.user_id,
//           item.item_name,
//           item.model,
//           item.item_unique_id,
//           item.quantity || 0
//         ]
//       );
//     }

//     res.status(200).json({
//       message: `${restoreResult.rowCount} item(s) restored successfully`,
//       restoredItems: restoreResult.rows,
//     });
//   })
// );
// ADD ITEM: Put new items at the end (highest display_order).
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
    await pool.query(`
      INSERT INTO inventory_transactions
        (item_id, category, user_id, item_name, model, item_unique_id,
         transaction_type, quantity_change, remarks, status, timestamp,
         price_update, site_name, change_summary)
      VALUES
        ($1, $2, $3, $4, $5, $6,
         'Add Item', $7, $8, 'Approved', NOW(),
         $9, $10, $11)
    `, [
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
      `New item added: ${newItem.item_name}, category: ${newItem.category}. Unit: ${newItem.unit}`
    ]);

    res.status(201).json({
      message: 'Item added successfully',
      item: newItem,
    });
  })
);

// ARCHIVE ITEMS: Mark as archived, keep item_id
app.patch(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'No items selected for archiving' });
    }

    const archiveResult = await pool.query(`
      UPDATE items
      SET archived_at = NOW(),
          updated_at = NOW(),
          display_order = NULL
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NULL
      RETURNING item_id, item_name, quantity, category, model, item_unique_id
    `, [itemIds]);

    for (const item of archiveResult.rows) {
      await pool.query(`
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp,
           change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Archive Item', -($7::integer),
           'Item archived', 'Approved', NOW(),
           'Item archived from admin dashboard.')
      `, [
        item.item_id,
        item.category,
        req.user.user_id,
        item.item_name,
        item.model,
        item.item_unique_id,
        item.quantity || 0
      ]);
    }

    const archivedCount = archiveResult.rowCount;
    const requestedCount = itemIds.length;
    let message = `${archivedCount} item(s) archived successfully.`;
    if (archivedCount < requestedCount) {
      message += ' The remaining items may already be archived or do not exist.';
    }

    return res.status(200).json({
      message,
      archivedItems: archiveResult.rows,
    });
  })
);

// RESTORE ITEMS: Assign a new sequential item_id
app.patch(
  '/admin-dashboard/items/restore',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected for restore' });
    }

    const itemsToRestore = await pool.query(`
      SELECT item_id
      FROM items
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NOT NULL
    `, [itemIds]);

    if (itemsToRestore.rowCount === 0) {
      return res.status(404).json({
        error: 'No archived items found or items already active',
      });
    }

    // 1) Get the highest item_id
    const { rows: maxRows } = await pool.query(`
      SELECT COALESCE(MAX(item_id), 0) AS max_id 
      FROM items 
      WHERE archived_at IS NULL
    `);
    let currentMaxId = parseInt(maxRows[0].max_id, 10);
    

    let restoreResult = { rows: [] };
    for (const itemId of itemIds) {
      currentMaxId++;

      const partialResult = await pool.query(`
        UPDATE items
        SET archived_at = NULL,
            updated_at = NOW(),
            display_order = (
              SELECT COALESCE(MAX(display_order), 0) + 1 FROM items WHERE archived_at IS NULL
            ),
            item_id = $2  -- Assign new sequential ID
        WHERE item_id = $1
          AND archived_at IS NOT NULL
        RETURNING item_id, item_name, quantity, category, model, item_unique_id, display_order
      `, [itemId, currentMaxId]);

      restoreResult.rows.push(...partialResult.rows);
    }

    for (const item of restoreResult.rows) {
      await pool.query(`
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp,
           change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Restore Item', $7,
           'Item restored back to dashboard', 'Approved', NOW(),
           'Item restored from archive to dashboard.')
      `, [
        item.item_id,
        item.category,
        req.user.user_id,
        item.item_name,
        item.model,
        item.item_unique_id,
        item.quantity || 0
      ]);
    }

    return res.status(200).json({
      message: `${restoreResult.rows.length} item(s) restored successfully`,
      restoredItems: restoreResult.rows,
    });
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
    const { price, remarks, quantityChange, site_name } = req.body;

    // Only admins can update the price
    if (price !== undefined && req.user.role_id !== 1) {
      return res
        .status(400)
        .json({ message: 'Non-admin users cannot update price.' });
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

    // Prepare new values
    let newQuantity = currentItem.quantity;
    let newPrice = currentItem.price;
    const newSiteName = site_name !== undefined ? site_name : currentItem.site_name;

    let isQuantityUpdated = false;
    let isPriceUpdated = false;
    let isSiteUpdated = false;
    let isRemarksUpdated = false;

    if (quantityChange !== undefined) {
      const parsedQty = parseInt(quantityChange, 10);
      if (isNaN(parsedQty)) {
        return res.status(400).json({ message: 'Invalid quantity change.' });
      }
      if (parsedQty !== 0) {
        newQuantity = currentItem.quantity + parsedQty;
        if (newQuantity < 0) {
          return res.status(400).json({ message: 'Insufficient stock.' });
        }
        isQuantityUpdated = true;
      }
    }

    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price value.' });
      }
      if (parsedPrice !== parseFloat(currentItem.price)) {
        newPrice = parsedPrice;
        isPriceUpdated = true;
      }
    }

    if (site_name !== undefined && site_name !== currentItem.site_name) {
      isSiteUpdated = true;
    }

    if (remarks !== undefined && remarks !== currentItem.remarks) {
      isRemarksUpdated = true;
    }

    if (
      !isQuantityUpdated &&
      !isPriceUpdated &&
      !isSiteUpdated &&
      !isRemarksUpdated
    ) {
      return res.json({
        message: 'No changes detected.',
        item: currentItem
      });
    }

    const updateQuery = `
      UPDATE items
      SET
        remarks = $1,
        quantity = $2,
        price = $3,
        site_name = $4,
        updated_at = NOW()
      WHERE item_id = $5
      RETURNING *;
    `;
    const { rows: updatedRows } = await pool.query(updateQuery, [
      remarks,
      newQuantity,
      newPrice,
      newSiteName,
      itemId
    ]);
    const updatedItem = updatedRows[0];

    let changeSummary = '';
    if (isQuantityUpdated) {
      const parsedQty = parseInt(quantityChange, 10);
      const changeType = parsedQty > 0 ? 'Add' : 'Subtract';
      changeSummary += `Quantity changed from ${currentItem.quantity} to ${newQuantity} (${changeType} ${Math.abs(parsedQty)}). `;
    }
    if (isPriceUpdated) {
      changeSummary += `Price changed from RM ${currentItem.price} to RM ${newPrice}. `;
    }
    if (isSiteUpdated) {
      changeSummary += `Site name changed from "${currentItem.site_name}" to "${newSiteName}". `;
    }
    if (isRemarksUpdated) {
      const oldRemarks = currentItem.remarks || 'N/A';
      changeSummary += `Remarks updated from "${oldRemarks}" to "${remarks}". `;
    }
    changeSummary = changeSummary.trim();

    const changesCount = [
      isQuantityUpdated,
      isPriceUpdated,
      isSiteUpdated,
      isRemarksUpdated
    ].filter(Boolean).length;

    let transactionType;
    if (changesCount > 1) {
      transactionType = 'Combined Update';
    } else if (isQuantityUpdated) {
      const parsedQty = parseInt(quantityChange, 10);
      transactionType = parsedQty > 0 ? 'Add' : 'Subtract';
    } else if (isPriceUpdated) {
      transactionType = 'Price Update';
    } else if (isSiteUpdated) {
      transactionType = 'Site Update';
    } else if (isRemarksUpdated) {
      transactionType = 'Remarks Update';
    } else {
      transactionType = 'Inventory Update';
    }

    await pool.query(
      `
        INSERT INTO inventory_transactions
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update, site_name, change_summary)
        VALUES
          ($1, $2, $3, $4, NOW(), $5, 'Approved', $6, $7, $8)
      `,
      [
        itemId,
        req.user.user_id,
        transactionType,
        isQuantityUpdated ? Math.abs(parseInt(quantityChange, 10)) : 0,
        remarks || '',
        isPriceUpdated ? newPrice : null,
        newSiteName,
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

// ---------------------------------------------------------------------
// 9) Reservation & Transaction Logs
// ---------------------------------------------------------------------
app.get(
  '/admin-dashboard/items/reservations',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM reservations WHERE reservation_status = 'In Progress'"
    );
    res.json({ items: result.rows });
  })
);

app.patch(
  '/admin-dashboard/items/:reservationId/complete',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;

    const updateResult = await pool.query(
      'UPDATE reservations SET reservation_status = $1 WHERE reservation_id = $2 RETURNING *',
      ['Completed', reservationId]
    );
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }
    const updatedReservation = updateResult.rows[0];

    const itemResult = await pool.query(
      'SELECT item_name, category, model, reserved_quantity, item_unique_id FROM items WHERE item_id = $1',
      [updatedReservation.item_id]
    );
    if (itemResult.rowCount === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    const itemDetails = itemResult.rows[0];
    const newReservedQuantity =
      itemDetails.reserved_quantity - updatedReservation.reserved_quantity;

    // Log a transaction
    const transactionResult = await pool.query(
      `INSERT INTO inventory_transactions
        (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update, site_name)
       VALUES ($1, $2, 'Reserve Complete', $3, NOW(), $4, 'Approved', NULL, NULL)
       RETURNING *`,
      [
        updatedReservation.item_id,
        userId,
        updatedReservation.reserved_quantity,
        by || 'Reservation completed',
      ]
    );
    const transactionEntry = transactionResult.rows[0];

    // Update item to reduce reserved quantity
    const updateItemResult = await pool.query(
      'UPDATE items SET reserved_quantity = $1, updated_at = NOW() WHERE item_id = $2 RETURNING *',
      [newReservedQuantity, updatedReservation.item_id]
    );
    if (updateItemResult.rowCount === 0) {
      return res.status(404).json({
        message: 'Failed to update item reserved quantity',
      });
    }
    const updatedItem = updateItemResult.rows[0];

    res.json({
      message: 'Reservation completed successfully.',
      reservation: updatedReservation,
      transaction: transactionEntry,
      updatedItem,
    });
  })
);

app.patch(
  '/admin-dashboard/items/:reservationId/cancel',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;
    try {
      await pool.query('BEGIN');
      const reservationResult = await pool.query(
        'SELECT item_id, reserved_quantity FROM reservations WHERE reservation_id = $1 FOR UPDATE',
        [reservationId]
      );
      if (reservationResult.rowCount === 0) {
        await pool.query('COMMIT');
        return res.status(404).json({ message: 'Reservation not found' });
      }
      const { item_id, reserved_quantity } = reservationResult.rows[0];
      const itemResult = await pool.query(
        'SELECT quantity, reserved_quantity, item_name, category, model, item_unique_id FROM items WHERE item_id = $1 FOR UPDATE',
        [item_id]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('COMMIT');
        return res.status(404).json({ message: 'Item not found' });
      }
      const {
        quantity,
        reserved_quantity: currentReservedQuantity,
      } = itemResult.rows[0];
      const updatedReservedQuantity = currentReservedQuantity - reserved_quantity;
      const updatedQuantity = quantity + reserved_quantity;

      // Update item to restore quantity
      const updateItem = await pool.query(
        'UPDATE items SET reserved_quantity = $1, quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
        [updatedReservedQuantity, updatedQuantity, item_id]
      );
      // Log transaction
      const transactionResult = await pool.query(
        `INSERT INTO inventory_transactions
          (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp)
         VALUES ($1, $2, 'Reserve Cancel', $3, $4, 'Pending', NOW())
         RETURNING *`,
        [item_id, userId, reserved_quantity, by || 'Reservation canceled']
      );
      const transactionEntry = transactionResult.rows[0];

      // Mark reservation canceled
      const updateReservation = await pool.query(
        'UPDATE reservations SET reservation_status = $1, updated_at = NOW() WHERE reservation_id = $2 RETURNING *',
        ['Canceled', reservationId]
      );
      await pool.query('COMMIT');
      res.json({
        message: 'Reservation canceled successfully, transaction logged.',
        item: updateItem.rows[0],
        reservation: updateReservation.rows[0],
        transaction: transactionEntry,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
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
        it.price_update,
        it.timestamp,
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
