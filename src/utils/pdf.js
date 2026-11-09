import jsPDF from 'jspdf';
import QRCode from 'qrcode';

const compressImage = (base64Str, maxWidth = 400, maxHeight = 400) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png', 0.8)); // Use PNG for transparency
    };
    img.onerror = () => resolve(base64Str); // Fallback to original
  });
};

export const generateInvoicePDF = async (order, settings) => {
  // 1. Pre-Flight Validation
  if (!settings?.logo || !settings?.storeName) {
    throw new Error('SettingsMissing');
  }

  try {
    // 2. Init jsPDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    let y = 15;

    // 3. Asset Handling: Logo
    try {
      let logoData = await compressImage(settings.logo);
      const logoWidth = 45;
      const logoHeight = 45;
      doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
      y += logoHeight + 2;
    } catch (imgErr) {
      console.warn("Logo rendering failed, rendering fallback text.", imgErr);
      doc.setFontSize(20);
      doc.setTextColor(212, 160, 23);
      doc.text("LOGO ERROR", pageWidth / 2, y + 20, { align: 'center' });
      y += 45;
    }

    // 4. Header Details
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 160, 23); // Gold
    doc.text(String(settings.storeName), pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    const addressLines = doc.splitTextToSize(String(settings.storeAddress || ''), 80);
    doc.text(addressLines, 15, y);
    
    doc.text(`Phone: ${settings.phone || ''}`, pageWidth - 15, y, { align: 'right' });
    doc.text(`Date: ${new Date(order.date).toLocaleDateString()} ${new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, pageWidth - 15, y + 5, { align: 'right' });
    y += Math.max(addressLines.length * 5, 10) + 5;

    // 5. QR Code
    try {
      const qrData = `Inv: #${order.id} | Total: $${order.total} | Bal: $${order.balance}`;
      const qrDataUrl = await QRCode.toDataURL(qrData, { width: 50, margin: 0 });
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - 25) / 2, y, 25, 25);
      y += 30;
    } catch (e) {
      console.warn('QR render failed', e);
    }

    // 6. Customer Info
    doc.setDrawColor(212, 160, 23);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(`BILL TO: ${order.customer?.name || 'Walk-in Customer'}`, 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Phone: ${order.customer?.phone || ''}`, 15, y + 6);
    
    doc.setFont("helvetica", "bold");
    if (order.status === 'draft') {
      doc.setTextColor(244, 162, 97);
      doc.text('STATUS: DRAFT', pageWidth - 15, y, { align: 'right' });
    } else {
      doc.setTextColor(42, 157, 143);
      doc.text(`INVOICE #${String(order.id).padStart(5, '0')}`, pageWidth - 15, y, { align: 'right' });
    }
    y += 12;

    // 7. Table Header (Fixed Layout)
    doc.setFillColor(212, 160, 23);
    doc.rect(15, y, pageWidth - 30, 8, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    
    const colX = { code: 17, color: 50, size: 80, qty: 110, price: 130, disc: 155, total: 180 };
    doc.text("Code", colX.code, y + 5.5);
    doc.text("Color", colX.color, y + 5.5);
    doc.text("Size", colX.size, y + 5.5);
    doc.text("Qty", colX.qty, y + 5.5);
    doc.text("Price", colX.price, y + 5.5);
    doc.text("Disc", colX.disc, y + 5.5);
    doc.text("Total", colX.total, y + 5.5);
    y += 12;

    // Table Rows
    doc.setFont("helvetica", "normal");
    const items = order.items || [];
    const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0);
    const isWholesale = totalQty >= 4;

    for (const item of items) {
      const price = isWholesale ? item.wholesalePrice : item.retailPrice;
      const eff = price - (item.discount || 0);
      const lineTotal = eff * item.quantity;
      
      doc.setTextColor(0, 0, 0);
      doc.text(String(item.modelCode || ''), colX.code, y);
      doc.text(String(item.color || ''), colX.color, y);
      doc.text(String(item.size || '-'), colX.size, y);
      doc.text(String(item.quantity || 0), colX.qty, y);
      doc.text(`$${Number(price).toFixed(2)}`, colX.price, y);
      
      if (item.discount > 0) {
        doc.setTextColor(230, 57, 70);
        doc.text(`-$${Number(item.discount).toFixed(2)}`, colX.disc, y);
      } else {
        doc.setTextColor(0, 0, 0);
        doc.text("-", colX.disc, y);
      }
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(`$${Number(lineTotal).toFixed(2)}`, colX.total, y);
      doc.setFont("helvetica", "normal");
      
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(15, y + 2, pageWidth - 15, y + 2);
      
      y += 8;

      if (y > pageHeight - 40) {
        doc.addPage();
        y = 15;
      }
    }
    y += 4;

    // 8. Totals & Payment Logic
    const rightCol = pageWidth - 15;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    
    // Notes block on the left
    if (order.note) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text('Note:', 15, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const noteLines = doc.splitTextToSize(String(order.note), 80);
      doc.text(noteLines, 15, y + 6);
    }

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('Subtotal:', rightCol - 30, y, { align: 'right' });
    doc.text(`$${Number(order.total || 0).toFixed(2)}`, rightCol, y, { align: 'right' });
    y += 6;

    if (order.orderDiscount > 0) {
      doc.text('Discount:', rightCol - 30, y, { align: 'right' });
      doc.setTextColor(230, 57, 70);
      doc.text(`-$${Number(order.orderDiscount).toFixed(2)}`, rightCol, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    if (order.balance <= 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(42, 157, 143);
      doc.text('Total Paid:', rightCol - 30, y, { align: 'right' });
      doc.text(`$${Number(order.finalTotal || order.total).toFixed(2)}`, rightCol, y, { align: 'right' });
    } else {
      doc.text('Deposit:', rightCol - 30, y, { align: 'right' });
      doc.setTextColor(42, 157, 143);
      doc.text(`-$${Number(order.deposit).toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 6;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(230, 57, 70);
      doc.text('Balance Due:', rightCol - 30, y, { align: 'right' });
      doc.text(`$${Number(order.balance).toFixed(2)}`, rightCol, y, { align: 'right' });
    }
    
    // 9. Mandatory Footer Injection
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    const footerY = pageHeight - 15;
    doc.text('Note: no return or change after two weeks from purchase date', pageWidth / 2, footerY, { align: 'center' });

    // Watermark if draft
    if (order.status === 'draft') {
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(60);
      doc.text("DRAFT", pageWidth / 2, pageHeight / 2, { align: "center", angle: -45 });
    }

    return doc.output('datauristring');
  } catch (err) {
    console.error('CRITICAL PDF ENGINE ERROR:', err);
    throw new Error('PDFGenerationFailed');
  }
};

export const generateReceiptPDF = async (order, settings) => {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 150] }); // Thermal receipt
    let y = 10;
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(String(settings?.storeName || 'BEE QUEEN'), 40, y, { align: 'center' });
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text('PAYMENT RECEIPT', 40, y, { align: 'center' });
    y += 10;

    doc.setFontSize(9);
    doc.text(`Date: ${new Date().toLocaleString()}`, 5, y);
    y += 5;
    doc.text(`Order: #${String(order.id).padStart(5, '0')}`, 5, y);
    y += 5;
    doc.text(`Customer: ${order.customer?.name || 'Walk-in'}`, 5, y);
    y += 8;

    doc.line(5, y, 75, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('Amount Paid:', 5, y);
    doc.text(`$${Number(order.amountPaid).toFixed(2)}`, 75, y, { align: 'right' });
    y += 8;

    doc.setFontSize(10);
    doc.text('New Balance:', 5, y);
    doc.text('$0.00', 75, y, { align: 'right' });
    y += 8;

    doc.line(5, y, 75, y);
    y += 10;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text('Thank you for your business!', 40, y, { align: 'center' });

    return doc.output('datauristring');
  } catch (err) {
    console.error('Receipt Gen Error:', err);
    return null;
  }
};
