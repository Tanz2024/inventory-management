import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper: Format dates using Intl.DateTimeFormat
const formatDateTime = (date) => {
  if (!(date instanceof Date) || isNaN(date)) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

// Helper: Aggregate logs for an item for the report table
const aggregateLogsForReport = (item, logs) => {
  // Filter logs that match the current item
  const itemLogs = logs.filter((log) => Number(log.item_id) === Number(item.item_id));
  let quantityAdded = 0;
  let quantitySubtracted = 0;
  let logDetailsArray = [];

  itemLogs.forEach((log) => {
    const qty = parseInt(log.quantity_change) || 0;
    const ts = formatDateTime(new Date(log.timestamp));
    if (log.transaction_type && log.transaction_type.toLowerCase() === 'add') {
      quantityAdded += qty;
      logDetailsArray.push(`Add: ${qty} at ${ts}`);
    } else if (log.transaction_type && log.transaction_type.toLowerCase() === 'subtract') {
      quantitySubtracted += Math.abs(qty);
      logDetailsArray.push(`Subtract: ${Math.abs(qty)} at ${ts}`);
    }
  });

  const logDetails = logDetailsArray.length > 0 ? logDetailsArray.join("\n") : "No changes";
  return {
    quantityAdded: quantityAdded.toString(),
    quantitySubtracted: quantitySubtracted.toString(),
    logDetails,
  };
};

 const generateReportPDF = (reportConfig) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const marginLeft = 15;
  const marginRight = 15;
  const marginTop = 15;

  // ----------------------------
  // Header Section
  // ----------------------------
  const logoPath = '/Squarecloud_Logo1.png';
  doc.addImage(logoPath, 'PNG', marginLeft, marginTop, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const headerX = marginLeft + 35;
  const headerY = marginTop + 5;
  doc.text('SQUARECLOUD(MALAYSIA) SDN BHD', headerX, headerY);
  doc.text('[201601025753 (1196692-P)]', headerX, headerY + 4);
  doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', headerX, headerY + 8);
  doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', headerX, headerY + 12);
  doc.text('46200 Petaling Jaya, Selangor', headerX, headerY + 16);
  doc.text('TEL: 03-7497 2558', headerX, headerY + 20);

  // ----------------------------
  // Report Title (Centered)
  // ----------------------------
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'Inventory Management Report',
    doc.internal.pageSize.getWidth() / 2,
    marginTop + 40,
    { align: 'center' }
  );

  // ----------------------------
  // Metadata Section
  // ----------------------------
  const lineY = marginTop + 45;
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.line(marginLeft, lineY, doc.internal.pageSize.getWidth() - marginRight, lineY);
  const metaStartY = lineY + 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Site Name: ${reportConfig.siteName || ''}`, marginLeft, metaStartY);
  
  // Display start and end dates on separate lines
  const startDateStr = reportConfig.startDate ? reportConfig.startDate.toLocaleDateString() : '';
  const endDateStr = reportConfig.endDate ? reportConfig.endDate.toLocaleDateString() : '';
  doc.text(`Start Date: ${startDateStr}`, marginLeft, metaStartY + 6);
  doc.text(`End Date: ${endDateStr}`, marginLeft, metaStartY + 12);
  
  // Recipient name on the right column
  const rightColumnX = doc.internal.pageSize.getWidth() / 2 + 10;
  doc.text(`Recipient Name: ${reportConfig.recipientName || ''}`, rightColumnX, metaStartY);

  // ----------------------------
  // Table Setup
  // ----------------------------
  // Define table headers per the new requirements
  const tableHeaders = [
    'Item Name',
    'Quantity at Present',
    'New Quantity Added',
    'New Quantity Out',
    'Log Changes',
  ];

  // Get the items and logs from the report configuration
  const items = Array.isArray(reportConfig.selectedItems) ? reportConfig.selectedItems : [];
  const logs = Array.isArray(reportConfig.logs) ? reportConfig.logs : [];

  // Build table data for each item
  const tableData = items.map((item) => {
    const { quantityAdded, quantitySubtracted, logDetails } = aggregateLogsForReport(item, logs);
    const currentQuantity = item.quantity !== undefined ? item.quantity.toString() : 'N/A';
    return [
      item.item_name || '',
      currentQuantity,
      quantityAdded,
      quantitySubtracted,
      logDetails,
    ];
  });

  // Draw the table using autoTable
  autoTable(doc, {
    startY: metaStartY + 18,
    head: [tableHeaders],
    body: tableData,
    styles: {
      font: 'helvetica',
      fontSize: 10,
      halign: 'center',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [0, 123, 255],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'center', cellWidth: 30 },
      4: { halign: 'left', cellWidth: 60 },
    },
    margin: { left: marginLeft, right: marginRight },
  });

  // ----------------------------
  // Footer Information
  // ----------------------------
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : metaStartY + 18;
  const infoY = finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const adminIssuedBy =
    reportConfig.adminName && reportConfig.adminName.trim().toLowerCase() !== 'admin'
      ? reportConfig.adminName.trim()
      : '';
  doc.text(`Admin Issued By: ${adminIssuedBy}`, marginLeft, infoY);
  doc.text(
    `Report Generated On: ${formatDateTime(new Date())}`,
    doc.internal.pageSize.getWidth() - marginRight,
    infoY,
    { align: 'right' }
  );

  // ----------------------------
  // Pagination Footer
  // ----------------------------
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - marginRight,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' }
    );
  }

  // Save the PDF file
  doc.save(`Inventory_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

export default generateReportPDF;
