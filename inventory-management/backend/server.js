require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Async handler wrapper to catch errors in async route handlers.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ==========================
// 1) Security & Middleware Setup
// ==========================
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

// Handle CORS for allowed client URLs (if any).
const allowedOrigins = process.env.CLIENT_URLS
  ? process.env.CLIENT_URLS.split(',')
  : [];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// --------------------------
// 2) Session Middleware Setup
// --------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your_strong_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'Strict',
    },
  })
);

// ==========================
// 3) JWT & Refresh Tokens Setup
// ==========================
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret';
const JWT_EXPIRATION = '365d';

// ==========================
// 4) Database Connection
// ==========================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// ==========================
// 5) Authentication Middleware
// ==========================
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res
      .status(401)
      .json({ message: 'Unauthorized – token missing' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ message: 'Forbidden – invalid token' });
    }
    req.user = user;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  // First check JWT, then verify admin role
  authenticateJWT(req, res, () => {
    if (req.user.role_id !== 1) {
      return res
        .status(403)
        .json({ message: 'Forbidden – admin only' });
    }
    next();
  });
};

// ==========================
// 6) Health Check & DB Test
// ==========================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

app.get(
  '/test-db',
  asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  })
);

// ==========================
// 7) File Upload (Multer) Setup
// ==========================
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// ==========================
// 8) Auth Routes
// ==========================
app.get('/authenticate', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      user_id: decoded.user_id,
      username: decoded.username,
      role_id: decoded.role_id,
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Username and password are required.' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role_id: user.role_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
    const refreshToken = jwt.sign(
      { user: user.username },
      JWT_REFRESH_SECRET,
      { expiresIn: '365d' }
    );
    // Store refresh in session
    req.session.refreshToken = refreshToken;
    // Send access token as cookie
    res.cookie('token', accessToken, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({
      message: 'Login successful',
      user_id: user.user_id,
      role_id: user.role_id,
      redirect:
        user.role_id === 1 ? '/admin-dashboard' : '/user-dashboard',
      accessToken,
    });
  })
);

app.post('/refresh', (req, res) => {
  const refreshToken = req.session.refreshToken;
  if (!refreshToken) {
    return res
      .status(403)
      .json({ message: 'No refresh token in session' });
  }
  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ message: 'Invalid refresh token' });
    }
    const newAccessToken = jwt.sign(
      { user: user.user },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
    res.cookie('token', newAccessToken, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ accessToken: newAccessToken });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ message: 'Could not log out' });
    }
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ message: 'Logged out successfully' });
  });
});

// ==========================
// 9) Admin Dashboard Endpoints
// ==========================
app.get(
  '/admin-dashboard/items',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM items WHERE archived_at IS NULL ORDER BY item_id ASC'
    );
    res.json({ items: result.rows });
  })
);

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

app.patch(
  '/admin-dashboard/items/:itemId/update',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { price, remarks, quantityChange, site_name } = req.body;

    // 1. Only admins can update the price
    if (price !== undefined && req.user.role_id !== 1) {
      return res
        .status(400)
        .json({ message: 'Non-admin users cannot update price.' });
    }

    // 2. Fetch current item
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM items WHERE item_id = $1',
      [itemId]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ message: 'Item not found.' });
    }
    const currentItem = itemRows[0];

    // 3. Prepare new values, defaulting to existing
    let newQuantity = currentItem.quantity;
    let newPrice = currentItem.price;
    const newSiteName =
      site_name !== undefined ? site_name : currentItem.site_name;

    // 4. Track which fields changed
    let isQuantityUpdated = false;
    let isPriceUpdated = false;
    let isSiteUpdated = false;
    let isRemarksUpdated = false;

    // 5. Handle quantity
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

    // 6. Handle price
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

    // 7. Handle site name
    if (site_name !== undefined && site_name !== currentItem.site_name) {
      isSiteUpdated = true;
    }

    // 8. Handle remarks
    if (remarks !== undefined && remarks !== currentItem.remarks) {
      isRemarksUpdated = true;
    }

    // 9. If no changes, return early
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

    // 10. Update the item
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

    // 11. Build change_summary
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

    // 12. Determine transaction_type
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

    // 13. Insert into inventory_transactions
    await pool.query(
      `
        INSERT INTO inventory_transactions 
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update, site_name, change_summary)
        VALUES
          ($1, $2, $3, $4, NOW(), $5, 'Approved', $6, $7, $8)
        RETURNING *;
      `,
      [
        itemId,
        req.user.user_id,
        transactionType,
        isQuantityUpdated ? Math.abs(parseInt(quantityChange, 10)) : 0,
        remarks || '',               // user remarks only
        isPriceUpdated ? newPrice : null,
        newSiteName,
        changeSummary                // store entire overview in change_summary
      ]
    );

    // 14. Return the updated item and the change summary
    return res.json({
      message: 'Item updated successfully.',
      item: updatedItem,
      changeSummary
    });
  })
);

app.delete(
  '/admin-dashboard/items',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'No items selected for archiving' });
    }
    const itemsToArchive = await pool.query(
      `SELECT item_id, category, item_name, quantity, model, item_unique_id 
       FROM items 
       WHERE item_id = ANY($1::int[]) AND archived_at IS NULL`,
      [itemIds]
    );
    if (itemsToArchive.rowCount === 0) {
      return res
        .status(404)
        .json({ error: 'No items found or already archived' });
    }
    const archiveQuery = `
      UPDATE items
      SET archived_at = NOW(), updated_at = NOW()
      WHERE item_id = ANY($1::int[]) AND archived_at IS NULL
      RETURNING item_id, item_name, quantity, category, model, item_unique_id
    `;
    const archiveResult = await pool.query(archiveQuery, [itemIds]);
    for (const item of archiveResult.rows) {
      await pool.query(
        `INSERT INTO inventory_transactions 
          (item_id, category, user_id, item_name, model, item_unique_id, transaction_type, quantity_change, remarks, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, 'Archive Item', -$7, 'Item archived', 'Approved', NOW())`,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id,
          item.quantity,
        ]
      );
    }
    res.status(200).json({
      message: `${archiveResult.rowCount} item(s) archived successfully`,
      archivedItems: archiveResult.rows,
    });
  })
);

// ==========================
// 10) Reservation & Transaction Logs
// ==========================
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
      return res
        .status(404)
        .json({ message: 'Reservation not found' });
    }
    const updatedReservation = updateResult.rows[0];

    const itemResult = await pool.query(
      'SELECT item_name, category, model, reserved_quantity, item_unique_id FROM items WHERE item_id = $1',
      [updatedReservation.item_id]
    );
    if (itemResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Item not found' });
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
        return res
          .status(404)
          .json({ message: 'Reservation not found' });
      }
      const { item_id, reserved_quantity } = reservationResult.rows[0];
      const itemResult = await pool.query(
        'SELECT quantity, reserved_quantity, item_name, category, model, item_unique_id FROM items WHERE item_id = $1 FOR UPDATE',
        [item_id]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('COMMIT');
        return res
          .status(404)
          .json({ message: 'Item not found' });
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

// ==========================
// 11) Logs & Transactions
// ==========================
app.get(
  '/logs',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const query = `
      SELECT 
        it.transaction_id,
        it.item_id,
        i.category,
        i.item_name,
        i.model,
        i.item_unique_id,
        it.site_name,
        u.username AS updated_by,
        it.transaction_type,
        it.quantity_change,
        it.price_update,
        it.timestamp,
        it.remarks,
        it.status,
        it.change_summary -- ✅ Ensure change_summary is included
      FROM 
        inventory_transactions it
      JOIN 
        items i ON it.item_id = i.item_id
      LEFT JOIN
        users u ON it.user_id = u.user_id
      ORDER BY 
        it.timestamp DESC;
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
      FROM 
        inventory_transactions it
      JOIN 
        items i ON it.item_id = i.item_id
      WHERE 
        it.status = 'Pending'
      ORDER BY 
        it.timestamp DESC;
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

// ==========================
// 12) File Upload & Management
// ==========================
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
        message: 'Files uploaded and saved to database successfully.',
      });
    } catch (error) {
      console.error('Error during file upload:', error);
      res
        .status(500)
        .json({ message: 'Internal Server Error', error: error.message });
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
      res
        .status(500)
        .json({ message: 'Internal Server Error', error: error.message });
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

// ==========================
// 13) Inventory Update Endpoints
// ==========================
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

// ==========================
// 14) 404 & Error Handlers
// ==========================
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res
    .status(500)
    .json({ message: 'Internal Server Error', error: err.message });
});

// ==========================
// 15) Start the Server
// ==========================
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Server running on port ${PORT}`)
);
