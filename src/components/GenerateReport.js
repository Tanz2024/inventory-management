import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Formats a Date object into a human-readable string.
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
 * generateReportPDF
 *
 * This function creates a PDF report that contains:
 *  - A header with company information and logo.
 *  - A metadata section with report details.
 *  - For each selected item, a table of transaction logs with a running stock
 *    calculation.
 *
 *  The logs are sorted from newest to oldest and the cumulative sum of quantity
 *  changes is used to determine the stock level prior to each transaction.
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

  // (Optional) If you previously computed totalQtyIn / totalQtyOut, we won't show them now
  // let totalQtyIn = 0;
  // let totalQtyOut = 0;

  // Group logs by item_id for per-item tables
  const logsByItemId = new Map();
  logs.forEach((log) => {
    // If you computed totalQtyIn / totalQtyOut, you can ignore or remove that logic
    // const qtyChange = parseInt(log.quantity_change, 10) || 0;
    // if (qtyChange > 0) totalQtyIn += qtyChange;
    // else if (qtyChange < 0) totalQtyOut += Math.abs(qtyChange);

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

  // ---------- SUMMARY TOTALS REMOVED ----------
  // (We no longer show "Total Quantity In" / "Total Quantity Out")

  // ---------- PER-ITEM TABLES ----------
  selectedItems.forEach((item) => {
    // Get logs for the item and sort in descending order (newest first)
    const itemLogs = (logsByItemId.get(item.item_id) || []).slice();
    itemLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Use a cumulative sum to calculate the running stock based on your formula.
    let cumulativeChange = 0;
    const tableRows = itemLogs.map((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      cumulativeChange += qtyChange;
      // Running Stock = max(currentStock - cumulativeChange, 0)
      const runningStock = Math.max(item.quantity - cumulativeChange, 0);

      const dtStr = formatDateTime(new Date(log.timestamp));
      let changedBy = log.updated_by || 'N/A';
      if (log.remarks) {
        const remarkLower = log.remarks.toLowerCase();
        if (remarkLower.includes('admin')) changedBy = 'Admin';
        else if (remarkLower.includes('user')) changedBy = 'User';
      }

      // Format quantity changes for display: + for additions, negative for removals
      const quantityIn = qtyChange > 0 ? `+${qtyChange}` : '';
      const quantityOut = qtyChange < 0 ? `${qtyChange}` : '';

      const displaySite = log.site_name && log.site_name.trim() !== '' ? log.site_name : 'N/A';
      const remarks = log.remarks || '';

      return [dtStr, changedBy, quantityIn, quantityOut, String(runningStock), displaySite, remarks];
    });

    // If no logs exist for the item, show a placeholder row.
    if (tableRows.length === 0) {
      tableRows.push([
        'No logs found',
        '',
        '',
        '',
        String(item.quantity),
        item.site_name || 'N/A',
        '',
      ]);
    }

    // Write item header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const headerText = `Item: ${item.item_name} (Current Stock: ${Math.max(item.quantity, 0)})`;
    doc.text(headerText, marginLeft, currentY);
    currentY += 6;

    // Table header and styles
    const headCols = ['Date & Time', 'Changed By', 'Qty In', 'Qty Out', 'Stock', 'Site', 'Remarks'];
    const tableHead = [headCols];

    const columnStyles = {};
    headCols.forEach((col, idx) => {
      let cellWidth = 25;
      switch (col.toLowerCase()) {
        case 'date & time':
          cellWidth = 38;
          break;
        case 'changed by':
          cellWidth = 25;
          break;
        case 'qty in':
          cellWidth = 20;
          break;
        case 'qty out':
          cellWidth = 20;
          break;
        case 'stock':
          cellWidth = 20;
          break;
        case 'site':
          cellWidth = 25;
          break;
        case 'remarks':
          cellWidth = 30;
          break;
        default:
          cellWidth = 25;
      }
      columnStyles[idx] = { halign: 'center', cellWidth };
    });
    const totalTableWidth = headCols.reduce((sum, _, idx) => sum + columnStyles[idx].cellWidth, 0);
    const startX = (pageWidth - totalTableWidth) / 2;

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

    // Check if page break is needed
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
