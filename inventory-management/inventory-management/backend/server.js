require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pdfParse = require('pdf-parse');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================
// Security & Middleware Setup
// ==========================

// Set secure HTTP headers with Helmet
app.use(helmet());

// Rate limiting (max 100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// CORS: allow origins defined in .env (CLIENT_URLS)
const allowedOrigins = process.env.CLIENT_URLS?.split(',') || [];
app.use(
  cors({
    origin: (origin, callback) => {
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
app.use(bodyParser.json());

// --------------------------
// Session Middleware Setup
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
// JWT & Refresh Tokens Setup
// ==========================
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret';
const JWT_EXPIRATION = '365d';

// ==========================
// Database Connection
// ==========================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// --------------------------
// Authentication Middleware
// --------------------------
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({ message: 'Unauthorized – token missing' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ message: 'Forbidden – invalid token' });
    req.user = user;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role_id !== 1)
      return res.status(403).json({ message: 'Forbidden – admin only' });
    req.user = user;
    next();
  });
};

// ==========================
// Health Check Endpoint
// ==========================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// ==========================
// Test DB Connection
// ==========================
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res
      .status(500)
      .json({ success: false, message: 'Database connection failed' });
  }
});

// ==========================
// OCR Helper Function
// ==========================
async function performOCR(imagePath) {
  const worker = await createWorker();
  try {
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const {
      data: { text },
    } = await worker.recognize(imagePath);
    if (!text) throw new Error('No text extracted from image');
    return text.split(/\s+/);
  } catch (err) {
    console.error('Error during OCR process:', err);
    throw err;
  } finally {
    await worker.terminate();
  }
}

// ==========================
// Multer File Upload Setup
// ==========================
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// ==========================
// Authentication Routes
// ==========================
app.get('/authenticate', (req, res) => {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({ message: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({
      user_id: decoded.user_id,
      username: decoded.username,
      role_id: decoded.role_id,
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res
      .status(400)
      .json({ message: 'Username and password are required.' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    if (result.rows.length === 0)
      return res.status(400).json({ message: 'User not found' });
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid credentials' });

    const accessToken = jwt.sign(
      { user_id: user.user_id, username: user.username, role_id: user.role_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
    const refreshToken = jwt.sign(
      { user: user.username },
      JWT_REFRESH_SECRET,
      { expiresIn: '365d' }
    );
    req.session.refreshToken = refreshToken;
    res.cookie('token', accessToken, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({
      message: 'Login successful',
      user_id: user.user_id,
      role_id: user.role_id,
      redirect: user.role_id === 1 ? '/admin-dashboard' : '/user-dashboard',
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/refresh', (req, res) => {
  const refreshToken = req.session.refreshToken;
  if (!refreshToken)
    return res.status(403).json({ message: 'No refresh token in session' });
  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ message: 'Invalid refresh token' });
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
    if (err)
      return res.status(500).json({ message: 'Could not log out' });
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ message: 'Logged out successfully' });
  });
});

// ==========================
// Admin Dashboard Endpoints
// ==========================
app.get('/admin-dashboard/items', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items WHERE archived_at IS NULL ORDER BY item_id ASC'
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Error fetching items' });
  }
});

app.get('/admin-dashboard/items/archive', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching archived items:', error);
    res.status(500).json({ message: 'Error fetching archived items' });
  }
});

app.patch('/admin-dashboard/items/:itemId/update', authenticateJWT, async (req, res) => {
  const { itemId } = req.params;
  const { price, remarks, quantityChange } = req.body;

  if (price !== undefined && req.user.role_id !== 1) {
    return res.status(400).json({ message: 'Non-admin users cannot update price.' });
  }

  try {
    const { rows: itemRows } = await pool.query('SELECT * FROM items WHERE item_id = $1', [itemId]);
    if (itemRows.length === 0) {
      return res.status(404).json({ message: 'Item not found.' });
    }
    const currentItem = itemRows[0];

    let newQuantity = currentItem.quantity;
    let newPrice = currentItem.price;
    let isQuantityUpdated = false;
    let isPriceUpdated = false;

    if (quantityChange !== undefined) {
      const qChange = parseInt(quantityChange, 10);
      if (isNaN(qChange)) {
        return res.status(400).json({ message: 'Invalid quantity change provided.' });
      }
      if (qChange !== 0) {
        newQuantity = currentItem.quantity + qChange;
        if (newQuantity < 0) {
          return res.status(400).json({ message: 'Insufficient stock: quantity cannot be negative.' });
        }
        isQuantityUpdated = true;
      }
    }

    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      const currentPrice = parseFloat(currentItem.price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price value provided.' });
      }
      if (parsedPrice !== currentPrice) {
        newPrice = parsedPrice;
        isPriceUpdated = true;
      }
    }

    if (!isQuantityUpdated && !isPriceUpdated) {
      return res.json({ message: 'No changes detected.', item: currentItem });
    }

    const updateQuery = `
      UPDATE items
      SET remarks = $1,
          quantity = $2,
          price = $3,
          updated_at = NOW()
      WHERE item_id = $4
      RETURNING *;
    `;
    const { rows: updatedRows } = await pool.query(updateQuery, [remarks, newQuantity, newPrice, itemId]);
    const updatedItem = updatedRows[0];

    let changeSummary = '';
    if (isQuantityUpdated && isPriceUpdated) {
      const qChange = parseInt(quantityChange, 10);
      const transactionType = qChange > 0 ? 'Add' : 'Subtract';
      const absChange = Math.abs(qChange);
      changeSummary = `Quantity ${transactionType} of ${absChange}; Price updated to RM ${newPrice}.`;
      const combinedLogQuery = `
        INSERT INTO inventory_transactions 
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update)
        VALUES ($1, $2, 'Combined Update', $3, NOW(), $4, 'Approved', $5)
        RETURNING *;
      `;
      await pool.query(combinedLogQuery, [itemId, req.user.user_id, Math.abs(qChange), remarks, newPrice]);
    } else if (isQuantityUpdated) {
      const qChange = parseInt(quantityChange, 10);
      const transactionType = qChange > 0 ? 'Add' : 'Subtract';
      const absChange = Math.abs(qChange);
      changeSummary = `Quantity ${transactionType} of ${absChange}.`;
      const qtyLogQuery = `
        INSERT INTO inventory_transactions 
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status)
        VALUES ($1, $2, $3, $4, NOW(), $5, 'Approved')
        RETURNING *;
      `;
      await pool.query(qtyLogQuery, [itemId, req.user.user_id, transactionType, Math.abs(qChange), remarks]);
    } else if (isPriceUpdated) {
      changeSummary = `Price updated to RM ${newPrice}.`;
      const priceLogQuery = `
        INSERT INTO inventory_transactions 
          (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, price_update)
        VALUES ($1, $2, 'Price Update', 0, NOW(), $3, 'Approved', $4)
        RETURNING *;
      `;
      await pool.query(priceLogQuery, [itemId, req.user.user_id, remarks, newPrice]);
    }

    return res.json({ message: 'Item updated successfully.', item: updatedItem, changeSummary });
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ message: 'Internal server error during item update.', error: error.message });
  }
});

app.post('/admin-dashboard/items/add', authenticateAdmin, async (req, res) => {
  const { item_name, category, model, unique, quantity, location, price, remarks } = req.body;
  if (!item_name || !category || !model || !unique || quantity == null || !location) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const existingItem = await pool.query('SELECT * FROM items WHERE item_unique_id = $1', [unique]);
    if (existingItem.rows.length > 0) {
      return res.status(400).json({ message: 'Item with this unique ID already exists' });
    }
    const result = await pool.query(
      `INSERT INTO items (item_name, category, model, item_unique_id, quantity, location, price, remarks, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [item_name, category, model, unique, quantity, location, price || 0, remarks || '']
    );
    const newItem = result.rows[0];
    await pool.query(
      `INSERT INTO inventory_transactions (item_id, category, user_id, item_name, model, item_unique_id, transaction_type, quantity_change, remarks, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, 'Add New Item', $7, 'New item added', 'Approved', NOW())`,
      [newItem.item_id, category, req.user.user_id, item_name, model, unique, quantity]
    );
    res.status(201).json({ message: 'Item added successfully', item: newItem });
  } catch (error) {
    console.error('Error adding item:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Item with this unique ID already exists' });
    }
    res.status(500).json({ message: 'Failed to add item' });
  }
});

app.delete('/admin-dashboard/items', authenticateAdmin, async (req, res) => {
  const { itemIds } = req.body;
  if (!itemIds || itemIds.length === 0) {
    return res.status(400).json({ error: 'No items selected for archiving' });
  }
  try {
    const itemsToArchive = await pool.query(
      `SELECT item_id, category, item_name, quantity, model, item_unique_id 
       FROM items 
       WHERE item_id = ANY($1::int[]) AND archived_at IS NULL`,
      [itemIds]
    );
    if (itemsToArchive.rowCount === 0) {
      return res.status(404).json({ error: 'No items found or already archived' });
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
        [item.item_id, item.category, req.user.user_id, item.item_name, item.model, item.item_unique_id, item.quantity]
      );
    }
    res.status(200).json({ message: `${archiveResult.rowCount} item(s) archived successfully`, archivedItems: archiveResult.rows });
  } catch (error) {
    console.error('Error archiving items:', error);
    res.status(500).json({ error: 'An error occurred while archiving items' });
  }
});

app.get('/admin-dashboard/items/reservations', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM reservations WHERE reservation_status = 'In Progress'");
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ message: 'An error occurred while fetching the reservations.' });
  }
});

app.patch('/admin-dashboard/items/:reservationId/complete', authenticateJWT, async (req, res) => {
  const { reservationId } = req.params;
  const { by } = req.body;
  const userId = req.user.user_id;
  try {
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
    const newReservedQuantity = itemDetails.reserved_quantity - updatedReservation.reserved_quantity;
    const transactionResult = await pool.query(
      `INSERT INTO inventory_transactions 
        (item_id, user_id, transaction_type, quantity_change, timestamp, remarks, status, model, item_name, category, item_unique_id)
       VALUES ($1, $2, 'Reserve Complete', $3, NOW(), $4, 'Approved', $5, $6, $7, $8) RETURNING *`,
      [updatedReservation.item_id, userId, updatedReservation.reserved_quantity, by, itemDetails.model, itemDetails.item_name, itemDetails.category, itemDetails.item_unique_id]
    );
    const transactionEntry = transactionResult.rows[0];
    const updateItemResult = await pool.query(
      'UPDATE items SET reserved_quantity = $1, updated_at = NOW() WHERE item_id = $2 RETURNING *',
      [newReservedQuantity, updatedReservation.item_id]
    );
    if (updateItemResult.rowCount === 0) {
      return res.status(404).json({ message: 'Failed to update item reserved quantity' });
    }
    const updatedItem = updateItemResult.rows[0];
    res.json({
      message: 'Reservation completed successfully.',
      reservation: updatedReservation,
      transaction: transactionEntry,
      updatedItem: updatedItem,
    });
  } catch (error) {
    console.error('Error completing reservation:', error);
    res.status(500).json({ message: 'An error occurred while completing the reservation.' });
  }
});

app.patch('/admin-dashboard/items/:reservationId/cancel', authenticateJWT, async (req, res) => {
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
    const { quantity, reserved_quantity: currentReservedQuantity, item_name, category, model, item_unique_id } = itemResult.rows[0];
    const updatedReservedQuantity = currentReservedQuantity - reserved_quantity;
    const updatedQuantity = quantity + reserved_quantity;
    const updateItem = await pool.query(
      'UPDATE items SET reserved_quantity = $1, quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
      [updatedReservedQuantity, updatedQuantity, item_id]
    );
    const transactionResult = await pool.query(
      `INSERT INTO inventory_transactions 
        (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp, model, item_name, category, item_unique_id)
       VALUES ($1, $2, 'Reserve Cancel', $3, $4, 'Pending', NOW(), $5, $6, $7, $8) RETURNING *`,
      [item_id, userId, reserved_quantity, by, model, item_name, category, item_unique_id]
    );
    const transactionEntry = transactionResult.rows[0];
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
    console.error('Error canceling reservation:', error);
    res.status(500).json({ message: 'An error occurred while canceling the reservation.' });
  }
});

// ==========================
// Logs & Transactions Endpoints
// ==========================
app.get('/logs', authenticateJWT, async (req, res) => {
  try {
    const query = `
      SELECT 
        it.transaction_id,
        it.item_id,
        i.category,
        i.item_name,
        i.model,
        i.item_unique_id,
        u.username AS updated_by,
        it.transaction_type,
        it.quantity_change,
        it.price_update,
        it.timestamp,
        it.remarks,
        it.status,
        CASE 
          WHEN it.transaction_type = 'Price Update' THEN CONCAT('Price updated to RM ', it.price_update)
          WHEN it.transaction_type IN ('Add', 'Subtract') THEN CONCAT('Quantity ', it.transaction_type, ': ', it.quantity_change)
          WHEN it.transaction_type = 'Combined Update' THEN CONCAT('Quantity ', 
            CASE WHEN it.quantity_change > 0 THEN 'Add' ELSE 'Subtract' END, 
            ': ', it.quantity_change, '; Price updated to RM ', it.price_update)
          ELSE 'N/A'
        END AS change_summary
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
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Failed to fetch logs.' });
  }
});

app.get('/pending-transactions', authenticateAdmin, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ message: 'Failed to fetch pending transactions.' });
  }
});

app.patch('/approve-transaction/:transactionId', authenticateAdmin, async (req, res) => {
  const { transactionId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE inventory_transactions
       SET status = 'Approved'
       WHERE transaction_id = $1 AND status = 'Pending'
       RETURNING *`,
      [transactionId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Transaction not found or already approved.' });
    }
    res.json({ message: 'Transaction approved successfully.', transaction: result.rows[0] });
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ message: 'Failed to approve transaction.' });
  }
});

// ==========================
// Upload Endpoint (OCR & GPT Integration)
// ==========================
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
          wordsArray = await performOCR(filePath);
        }
        const gptResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'user',
                content: `(This is my OCR results: ${wordsArray}) Extract System Devices, ID, and Qty. (System Devices must be only words, ID must have 5 characters only, Qty just numbers.) Return results in JSON format: [{"system_devices": "Device1", "id": "deviceId", "qty": qty}]`,
              },
            ],
            temperature: 0.7,
            max_tokens: 600,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        return { gptSummary: gptResponse.data.choices[0].message.content.trim() };
      })
    );
    res.json({ summaries });
  } catch (error) {
    console.error('Error during OCR/GPT process:', error);
    res.status(500).send('Error processing the files.');
  }
});

// ==========================
// New Delivery Inventory Update Endpoint
// ==========================
app.post('/delivery/update-inventory', authenticateJWT, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid payload: items array required.' });
  }

  try {
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query('SELECT quantity FROM items WHERE item_id = $1', [itemId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity - Number(qty);
      if (newQuantity < 0) {
        return res.status(400).json({ message: `Insufficient quantity for item with id ${itemId}.` });
      }
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({ message: 'Inventory updated successfully.' });
  } catch (error) {
    console.error('Error updating inventory in delivery:', error);
    res.status(500).json({ message: 'Error updating inventory.' });
  }
});

// ==========================
// New Goods Received Inventory Update Endpoint
// ==========================
// This endpoint increases the item quantity in stock based on goods received.
app.post('/goodsreceived/update-inventory', authenticateJWT, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid payload: items array required.' });
  }
  try {
    // For each item, add the received quantity to current stock.
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query('SELECT quantity FROM items WHERE item_id = $1', [itemId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity + Number(qty);
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({ message: 'Inventory updated successfully after goods received.' });
  } catch (error) {
    console.error('Error updating inventory in goods received:', error);
    res.status(500).json({ message: 'Error updating inventory.' });
  }
});

// ==========================
// 404 & Error Handlers
// ==========================
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal Server Error' });
});

// ==========================
// Start the Server
// ==========================
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
