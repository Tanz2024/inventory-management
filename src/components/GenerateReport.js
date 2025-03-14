import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Formats a Date object into a full, human-readable date & time string.
 */
function formatDateTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * Formats a Date object into a short format for the Date & Time column.
 * The output format will be like "8 may 2025".
 */
function formatKeyInDateShort(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
  const day = date.getDate();
  let month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  month = month.replace('.', '').toLowerCase();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;  // Added spaces between day, month, and year
}

/**
 * generateReportPDF
 *
 * - Uses "Timestamp" for the full log date & time.
 * - The second column now shows a simplified Date & Time in short format (e.g. “8 may 2025”)
 *   and its header is renamed to "Date & Time".
 * - Skips rows where quantity_change = 0 (i.e. no quantity in/out change).
 * - The "Changed By Who" column displays `log.remarks`.
 */
export default function generateReportPDF(reportConfig) {
  const {
    selectedItems = [],
    logs = [],
    locationFilter = null,
    adminName = 'N/A',
    siteName = '',
    startDate = null,
    endDate = null,
    recipientName = '',
  } = reportConfig;

  // Convert startDate and endDate to Date objects if needed
  const startDateObj = startDate ? new Date(startDate) : null;
  const endDateObj = endDate ? new Date(endDate) : null;

  // Create new PDF document
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 15;
  const marginTop = 15;

  // Group logs by item_id for per-item tables
  const logsByItemId = new Map();
  logs.forEach((log) => {
    if (!logsByItemId.has(log.item_id)) {
      logsByItemId.set(log.item_id, []);
    }
    logsByItemId.get(log.item_id).push(log);
  });

  // ---------- HEADER ----------
  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    let headerY = marginTop;
    doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', marginLeft, headerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    headerY += 6;
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', marginLeft, headerY);
    headerY += 5;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', marginLeft, headerY);
    headerY += 5;
    doc.text('46200 Petaling Jaya, Selangor', marginLeft, headerY);
    headerY += 5;
    doc.text('Tel: 03-7497 2558', marginLeft, headerY);

    // Add company logo (if available)
    const logoWidth = 40;
    const logoHeight = 40;
    const logoX = pageWidth - logoWidth - marginRight;
    const logoY = 10;
    try {
      doc.addImage('/Squarecloud_Logo1.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }
    doc.setLineWidth(0.5);
    doc.line(marginLeft, headerY + 4, pageWidth - marginRight, headerY + 4);
  };
  drawHeader();

  // ---------- METADATA SECTION ----------
  let currentY = marginTop + 45; // leave space below header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Inventory Management Report', pageWidth / 2, currentY, { align: 'center' });
  currentY += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  if (siteName) {
    doc.text(`Site: ${siteName}`, marginLeft, currentY);
    currentY += 5;
  }
  if (startDateObj) {
    doc.text(`Start Date: ${startDateObj.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  if (endDateObj) {
    doc.text(`End Date: ${endDateObj.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  if (locationFilter) {
    doc.text(`Location: ${locationFilter}`, marginLeft, currentY);
    currentY += 5;
  }
  doc.text(`Report Time: ${formatDateTime(new Date())}`, marginLeft, currentY);
  currentY += 5;
  if (recipientName) {
    doc.text(`Recipient: ${recipientName}`, marginLeft, currentY);
    currentY += 5;
  }
  doc.text(`Admin Issued By: ${adminName}`, marginLeft, currentY);
  currentY += 10;

  // ---------- PER-ITEM TABLES ----------
  selectedItems.forEach((item) => {
    // 1) Filter logs for this item and skip any log with quantity_change = 0
    let itemLogs = logsByItemId.get(item.item_id) || [];
    itemLogs = itemLogs.filter((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      return qtyChange !== 0;
    });

    // 2) Sort the logs in descending order (newest first)
    itemLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 3) Build table rows with a cumulative stock calculation
    let cumulativeChange = 0;
    const tableRows = itemLogs.map((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      cumulativeChange += qtyChange;

      // Running Stock = max(item.quantity - cumulativeChange, 0)
      const runningStock = Math.max(item.quantity - cumulativeChange, 0);

      // Use full timestamp for the first column
      const timestampStr = formatDateTime(new Date(log.timestamp));

      // For the Date & Time column, use the short format. Use log.key_in_date if available; otherwise, fallback to log.timestamp.
      const keyInDate = log.key_in_date || log.timestamp;
      const keyInStr = formatKeyInDateShort(new Date(keyInDate));

      // "Changed By Who" column uses log.remarks
      const changedByWho = log.remarks || '';

      // Format quantity changes
      const quantityIn = qtyChange > 0 ? `+${qtyChange}` : '';
      const quantityOut = qtyChange < 0 ? `${qtyChange}` : '';
      const displaySite = log.site_name && log.site_name.trim() !== '' ? log.site_name : 'N/A';

      return [
        timestampStr,  // Timestamp column
        keyInStr,      // Date & Time column (short format)
        changedByWho,  // Changed By Who
        quantityIn,
        quantityOut,
        String(runningStock),
        displaySite,
      ];
    });

    // If no logs remain after filtering, show a placeholder row
    if (tableRows.length === 0) {
      tableRows.push([
        'No quantity changes found',
        'N/A',
        'N/A',
        '',
        '',
        String(item.quantity),
        item.site_name || 'N/A',
      ]);
    }

    // 4) Item header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const headerText = `Item: ${item.item_name} (Current Stock: ${Math.max(item.quantity, 0)})`;
    doc.text(headerText, marginLeft, currentY);
    currentY += 6;

    // 5) Table header (7 columns total)
    const headCols = [
      'Timestamp',
      'Date & Time',
      'Changed By Who',
      'Qty In',
      'Qty Out',
      'Stock',
      'Site',
    ];
    const tableHead = [headCols];

    // Column styles (adjust widths as needed)
    const columnStyles = {
      0: { halign: 'center', cellWidth: 38 }, // Timestamp
      1: { halign: 'center', cellWidth: 38 }, // Date & Time
      2: { halign: 'center', cellWidth: 35 }, // Changed By Who
      3: { halign: 'center', cellWidth: 20 }, // Qty In
      4: { halign: 'center', cellWidth: 20 }, // Qty Out
      5: { halign: 'center', cellWidth: 20 }, // Stock
      6: { halign: 'center', cellWidth: 25 }, // Site
    };

    const totalTableWidth = Object.values(columnStyles).reduce(
      (sum, style) => sum + style.cellWidth,
      0
    );
    const startX = (pageWidth - totalTableWidth) / 2;

    // 6) Render the table
    autoTable(doc, {
      startY: currentY,
      startX: startX,
      head: tableHead,
      body: tableRows,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        halign: 'center',
        overflow: 'linebreak',
        textColor: 0,
      },
      headStyles: {
        fillColor: [30, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles,
      margin: { left: marginLeft, right: marginRight },
    });

    currentY = doc.lastAutoTable.finalY + 10;

    // 7) Page break check
    if (currentY > pageHeight - 40) {
      doc.addPage();
      drawHeader();
      currentY = marginTop + 45;
    }
  });

  // ---------- FOOTER (PAGE NUMBERING) ----------
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight, pageHeight - 10, {
      align: 'right',
    });
  }

  // Save the PDF with a date-based filename
  doc.save(`Inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
}
