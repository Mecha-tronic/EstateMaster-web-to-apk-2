import PDFDocument from 'pdfkit';

export interface PaymentRecord {
  id?: string;
  serialNumber?: string;
  amount: number;
  paymentMethod: string;
  referenceCode: string;
  paymentDate: string;
  periodMonth?: string;
  notes?: string;
  status?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  tenantName?: string;
  tenantEmail?: string;
  unitNumber?: string;
  propertyName?: string;
}

export interface StatementPdfOptions {
  companyName?: string;
  landlordName?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  unitNumber?: string;
  propertyName?: string;
  moveInDate?: string;
  currentPayment: PaymentRecord;
  paymentHistory: PaymentRecord[];
  cumulativeTotalPaid: number;
}

export interface InvoicePdfOptions {
  companyName?: string;
  landlordName?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  landlordPaybill?: string;
  landlordTill?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  invoice: {
    id?: string;
    serialNumber?: string;
    invoiceNumber: string;
    issueDate?: string;
    dueDate?: string;
    periodMonth?: string;
    rentAmount?: number;
    waterFee?: number;
    trashFee?: number;
    maintenanceFee?: number;
    discount?: number;
    previousArrears?: number;
    totalAmount: number;
    status?: string;
    notes?: string;
    unitNumber?: string;
    propertyName?: string;
  };
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  unitNumber?: string;
  propertyName?: string;
  propertyAddress?: string;
}

/**
 * Formats Kenyan Shillings with commas
 */
function formatMoney(amount: number): string {
  return `KSh ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Generates an official, publication-quality PDF containing both the Payment Receipt
 * and the complete Tenancy Lifetime Statement (all payments since move-in & cumulative total).
 */
export function generatePaymentReceiptAndStatementPdf(options: StatementPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Payment Receipt & Statement - ${options.currentPayment.serialNumber || 'Receipt'}`,
          Author: options.companyName || 'EstateMaster Kenya',
          Subject: `Tenancy Statement for ${options.tenantName}`,
          Keywords: 'Receipt, Statement, Rent, M-Pesa, EstateMaster',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const primaryColor = '#0F172A'; // Deep Navy
      const accentColor = '#0284C7';  // Cyan / Sky
      const successColor = '#16A34A'; // Emerald Green
      const textMuted = '#64748B';
      const textDark = '#1E293B';
      const borderLine = '#E2E8F0';

      // -------------------------------------------------------------
      // 1. BRAND HEADER & DOCUMENT TITLE
      // -------------------------------------------------------------
      // Top colored banner
      doc.rect(40, 40, 515, 6).fill(accentColor);

      doc.moveDown(1);
      const headerTop = 55;

      // Brand Logo / Title
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(primaryColor)
        .text('Estate', 40, headerTop, { continued: true })
        .fillColor(accentColor)
        .text('Master')
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(textMuted)
        .text(
          (options.companyName || 'KENYA PROPERTY MANAGEMENT & RENT SYSTEMS').toUpperCase(),
          40,
          headerTop + 24
        );

      // Document Type & Serial Number (Right Aligned)
      const docSerial = options.currentPayment.serialNumber || `SN-RCT-${Date.now().toString().slice(-6)}`;
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(successColor)
        .text('OFFICIAL PAYMENT RECEIPT', 250, headerTop, { align: 'right', width: 305 });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(textMuted)
        .text('& LIFETIME STATEMENT OF ACCOUNT', 250, headerTop + 15, { align: 'right', width: 305 });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(accentColor)
        .text(`SERIAL: ${docSerial}`, 250, headerTop + 28, { align: 'right', width: 305 });

      // Horizontal Divider
      doc
        .strokeColor(borderLine)
        .lineWidth(1)
        .moveTo(40, 95)
        .lineTo(555, 95)
        .stroke();

      // -------------------------------------------------------------
      // 2. TENANT & PROPERTY INFORMATION CARD
      // -------------------------------------------------------------
      const cardY = 105;
      doc.rect(40, cardY, 515, 68).fillAndStroke('#F8FAFC', borderLine);

      // Column 1: Tenant Information
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(textMuted)
        .text('TENANT DETAILS', 55, cardY + 8);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(textDark)
        .text(options.tenantName, 55, cardY + 20);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(textMuted)
        .text(`Email: ${options.tenantEmail || 'N/A'}`, 55, cardY + 34)
        .text(`Phone: ${options.tenantPhone || 'N/A'}`, 55, cardY + 48);

      // Column 2: Apartment & Building Information
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(textMuted)
        .text('PROPERTY & PREMISES', 300, cardY + 8);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(textDark)
        .text(`Unit ${options.unitNumber || 'Apartment'}`, 300, cardY + 20);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(textMuted)
        .text(`Building: ${options.propertyName || 'Residential Building'}`, 300, cardY + 34)
        .text(`Move-In Date: ${options.moveInDate || 'Active Tenancy'}`, 300, cardY + 48);

      // -------------------------------------------------------------
      // 3. CURRENT TRANSACTION RECEIPT (HIGHLIGHT BOX)
      // -------------------------------------------------------------
      const receiptY = 185;
      doc.rect(40, receiptY, 515, 82).fillAndStroke('#F0FDF4', '#86EFAC');

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#166534')
        .text('VERIFIED PAYMENT RECEIVED', 55, receiptY + 10);

      const payDateFormatted = options.currentPayment.paymentDate
        ? new Date(options.currentPayment.paymentDate).toLocaleString('en-KE')
        : new Date().toLocaleString('en-KE');

      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#15803D')
        .text(formatMoney(options.currentPayment.amount), 55, receiptY + 26);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#166534')
        .text(`Payment Date: ${payDateFormatted}`, 55, receiptY + 54);

      // Transaction metadata (right side of receipt card)
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#14532D')
        .text(`Reference / M-Pesa Code: `, 300, receiptY + 14, { continued: true })
        .font('Helvetica-Bold')
        .text(options.currentPayment.referenceCode || 'CONFIRMED')
        .font('Helvetica')
        .text(`Payment Method: `, 300, receiptY + 28, { continued: true })
        .font('Helvetica-Bold')
        .text(options.currentPayment.paymentMethod || 'M-Pesa')
        .font('Helvetica')
        .text(`Period / Invoice: `, 300, receiptY + 42, { continued: true })
        .font('Helvetica-Bold')
        .text(options.currentPayment.periodMonth || options.currentPayment.invoiceId || 'Monthly Rent')
        .font('Helvetica')
        .text(`Status: `, 300, receiptY + 56, { continued: true })
        .font('Helvetica-Bold')
        .fillColor(successColor)
        .text('Completed & Reconciled');

      // -------------------------------------------------------------
      // 4. LIFETIME PAYMENT STATEMENT TABLE (Ever Since Move-In)
      // -------------------------------------------------------------
      const statementStartY = 280;
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(primaryColor)
        .text('LIFETIME PAYMENT STATEMENT (All Payments Since Move-In)', 40, statementStartY);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(textMuted)
        .text(
          'Complete audit trail of all verified rent, deposit, and utility payments received from this tenant since inception.',
          40,
          statementStartY + 14
        );

      // Table Header
      const tableHeaderY = statementStartY + 30;
      doc.rect(40, tableHeaderY, 515, 20).fill('#0F172A');

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      doc.text('#', 48, tableHeaderY + 6);
      doc.text('PAYMENT DATE', 68, tableHeaderY + 6);
      doc.text('REFERENCE / SERIAL', 165, tableHeaderY + 6);
      doc.text('PERIOD / PURPOSE', 290, tableHeaderY + 6);
      doc.text('METHOD', 395, tableHeaderY + 6);
      doc.text('AMOUNT', 465, tableHeaderY + 6, { align: 'right', width: 80 });

      // Table Rows
      let currentY = tableHeaderY + 20;
      const history = options.paymentHistory || [];

      // Sort chronological ascending (or current descending)
      const sortedHistory = [...history].sort((a, b) => {
        const da = new Date(a.paymentDate).getTime() || 0;
        const db = new Date(b.paymentDate).getTime() || 0;
        return da - db;
      });

      if (sortedHistory.length === 0) {
        doc.rect(40, currentY, 515, 24).fillAndStroke('#FFFFFF', borderLine);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(textMuted)
          .text('First recorded payment on file.', 50, currentY + 7);
        currentY += 24;
      } else {
        sortedHistory.forEach((p, idx) => {
          // Page overflow check
          if (currentY > 710) {
            doc.addPage();
            currentY = 40;
            // Redraw mini table header
            doc.rect(40, currentY, 515, 18).fill('#0F172A');
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
            doc.text('#', 48, currentY + 5);
            doc.text('PAYMENT DATE', 68, currentY + 5);
            doc.text('REFERENCE / SERIAL', 165, currentY + 5);
            doc.text('PERIOD / PURPOSE', 290, currentY + 5);
            doc.text('METHOD', 395, currentY + 5);
            doc.text('AMOUNT', 465, currentY + 5, { align: 'right', width: 80 });
            currentY += 18;
          }

          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(40, currentY, 515, 20).fillAndStroke(rowBg, borderLine);

          const dateStr = p.paymentDate
            ? new Date(p.paymentDate).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Recent';

          const refStr = p.referenceCode || p.serialNumber || 'N/A';
          const periodStr = (p.periodMonth || p.notes || 'Rent Payment').slice(0, 22);
          const methodStr = p.paymentMethod || 'M-Pesa';

          doc.font('Helvetica').fontSize(8).fillColor(textDark);
          doc.text(String(idx + 1), 48, currentY + 6);
          doc.text(dateStr, 68, currentY + 6);
          doc.font('Helvetica-Bold').text(refStr, 165, currentY + 6);
          doc.font('Helvetica').text(periodStr, 290, currentY + 6);
          doc.text(methodStr, 395, currentY + 6);
          doc.font('Helvetica-Bold').fillColor('#0284C7').text(formatMoney(p.amount), 465, currentY + 6, {
            align: 'right',
            width: 80,
          });

          currentY += 20;
        });
      }

      // -------------------------------------------------------------
      // 5. CUMULATIVE AMOUNT PAID HIGHLIGHT SUMMARY
      // -------------------------------------------------------------
      if (currentY > 680) {
        doc.addPage();
        currentY = 40;
      }

      currentY += 10;
      doc.rect(40, currentY, 515, 42).fillAndStroke('#FEF08A', '#EAB308'); // Warm golden yellow highlight

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#854D0E')
        .text('CUMULATIVE TOTAL PAID TO DATE (SINCE MOVE-IN)', 55, currentY + 8);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#713F12')
        .text(`Total Payments Count: ${sortedHistory.length} verified transactions`, 55, currentY + 24);

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#713F12')
        .text(formatMoney(options.cumulativeTotalPaid), 330, currentY + 12, { align: 'right', width: 210 });

      // -------------------------------------------------------------
      // 6. OFFICIAL AUTHENTICATION FOOTER
      // -------------------------------------------------------------
      const footerY = currentY + 55;
      if (footerY < 760) {
        doc
          .strokeColor(borderLine)
          .lineWidth(1)
          .moveTo(40, footerY)
          .lineTo(555, footerY)
          .stroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(textDark)
          .text('ESTATEMASTER KENYA OFFICIAL STATEMENT VERIFICATION', 40, footerY + 8, { align: 'center', width: 515 });

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(textMuted)
          .text(
            `This statement is an electronically generated and tamper-verified legal financial record for Unit ${options.unitNumber || ''} (${options.propertyName || ''}).`,
            40,
            footerY + 18,
            { align: 'center', width: 515 }
          )
          .text(
            `Authenticated Serial: ${docSerial} • Support: support@estatemaster.co.ke • Nairobi, Kenya`,
            40,
            footerY + 28,
            { align: 'center', width: 515 }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an official, publication-quality PDF Monthly Rent Invoice
 * with complete itemized breakdown, arrears calculation, and registered payment channels.
 */
export function generateInvoicePdf(options: InvoicePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Monthly Invoice - #${options.invoice.invoiceNumber}`,
          Author: options.companyName || options.landlordName || 'EstateMaster Kenya',
          Subject: `Rental Invoice for ${options.tenantName}`,
          Keywords: 'Invoice, Rent, EstateMaster, Kenya',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const primaryColor = '#0F172A'; // Deep Navy
      const accentColor = '#0284C7';  // Cyan / Sky
      const textMuted = '#64748B';
      const textDark = '#1E293B';
      const borderLine = '#E2E8F0';

      // -------------------------------------------------------------
      // 1. BRAND HEADER & DOCUMENT TITLE
      // -------------------------------------------------------------
      doc.rect(40, 40, 515, 6).fill(accentColor);

      const headerTop = 55;

      // Brand Logo / Title
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(primaryColor)
        .text('Estate', 40, headerTop, { continued: true })
        .fillColor(accentColor)
        .text('Master')
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(textMuted)
        .text(
          (options.companyName || options.landlordName || 'KENYA PROPERTY MANAGEMENT & RENT SYSTEMS').toUpperCase(),
          40,
          headerTop + 24
        );

      const docSerial = options.invoice.serialNumber || `SN-INV-${Date.now().toString().slice(-6)}`;
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(primaryColor)
        .text('OFFICIAL RENTAL INVOICE', 250, headerTop, { align: 'right', width: 305 });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(accentColor)
        .text(`INVOICE #${options.invoice.invoiceNumber}`, 250, headerTop + 18, { align: 'right', width: 305 });

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(textMuted)
        .text(`SERIAL: ${docSerial}`, 250, headerTop + 32, { align: 'right', width: 305 });

      // Horizontal Divider
      doc
        .strokeColor(borderLine)
        .lineWidth(1)
        .moveTo(40, 98)
        .lineTo(555, 98)
        .stroke();

      // -------------------------------------------------------------
      // 2. INVOICE METADATA & RECIPIENT DETAILS
      // -------------------------------------------------------------
      const metaY = 108;

      // Left Box: Landlord & Premises
      doc.rect(40, metaY, 250, 82).fillAndStroke('#F8FAFC', borderLine);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(accentColor)
        .text('ISSUER & PROPERTY PREMISES', 50, metaY + 8);

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(textDark)
        .text(options.companyName || options.landlordName || 'Estate Management', 50, metaY + 22);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(textMuted)
        .text(`Building: ${options.propertyName || options.invoice.propertyName || 'Property Premises'}`, 50, metaY + 36)
        .text(`Address: ${options.propertyAddress || 'Nairobi, Kenya'}`, 50, metaY + 48)
        .text(`Contact: ${options.landlordEmail || 'support@estatemaster.co.ke'} • ${options.landlordPhone || '+254 700 000 000'}`, 50, metaY + 60);

      // Right Box: Tenant & Billing Period
      doc.rect(305, metaY, 250, 82).fillAndStroke('#F8FAFC', borderLine);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(accentColor)
        .text('BILLED TENANT & TIMELINES', 315, metaY + 8);

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(textDark)
        .text(`${options.tenantName} (Unit ${options.unitNumber || options.invoice.unitNumber || 'A1'})`, 315, metaY + 22);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(textMuted)
        .text(`Email: ${options.tenantEmail || 'N/A'} • Phone: ${options.tenantPhone || 'N/A'}`, 315, metaY + 36)
        .text(`Billing Period: ${options.invoice.periodMonth || 'Current Month'}`, 315, metaY + 48)
        .text(`Issue Date: ${options.invoice.issueDate || new Date().toISOString().split('T')[0]} • Due Date: ${options.invoice.dueDate}`, 315, metaY + 60);

      // -------------------------------------------------------------
      // 3. ITEMIZED BREAKDOWN TABLE
      // -------------------------------------------------------------
      const tableTop = 202;

      // Table Header Row
      doc.rect(40, tableTop, 515, 22).fill('#1E293B');
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#FFFFFF')
        .text('ITEM DESCRIPTION', 50, tableTop + 6)
        .text('CATEGORY', 330, tableTop + 6)
        .text('AMOUNT (KSH)', 440, tableTop + 6, { align: 'right', width: 105 });

      let currentY = tableTop + 22;

      // Line items array
      const items: Array<{ label: string; cat: string; amount: number; isArrears?: boolean; isDiscount?: boolean }> = [
        { label: `Base Monthly Rent (${options.invoice.periodMonth || 'Current Month'})`, cat: 'Rent', amount: options.invoice.rentAmount || 0 },
      ];

      if (options.invoice.previousArrears && options.invoice.previousArrears > 0) {
        items.push({ label: 'Outstanding Previous Arrears (Unpaid Balance)', cat: 'Overdue Arrears', amount: options.invoice.previousArrears, isArrears: true });
      }
      if (options.invoice.waterFee && options.invoice.waterFee > 0) {
        items.push({ label: 'Water & Utility Charges', cat: 'Utilities', amount: options.invoice.waterFee });
      }
      if (options.invoice.trashFee && options.invoice.trashFee > 0) {
        items.push({ label: 'Trash Collection & Sanitation', cat: 'Service', amount: options.invoice.trashFee });
      }
      if (options.invoice.maintenanceFee && options.invoice.maintenanceFee > 0) {
        items.push({ label: 'Maintenance & Repairs Charge', cat: 'Maintenance', amount: options.invoice.maintenanceFee });
      }
      if (options.invoice.discount && options.invoice.discount > 0) {
        items.push({ label: 'Special Promotional Discount', cat: 'Credit / Discount', amount: options.invoice.discount, isDiscount: true });
      }

      items.forEach((item, idx) => {
        const rowHeight = 22;
        const isEven = idx % 2 === 0;
        const rowBg = item.isArrears ? '#FEF3C7' : (isEven ? '#FFFFFF' : '#F8FAFC');

        doc.rect(40, currentY, 515, rowHeight).fillAndStroke(rowBg, borderLine);

        doc
          .font(item.isArrears ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(item.isArrears ? '#92400E' : (item.isDiscount ? '#15803D' : textDark))
          .text(item.label, 50, currentY + 6);

        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(item.isArrears ? '#B45309' : textMuted)
          .text(item.cat, 330, currentY + 6);

        const amtStr = item.isDiscount ? `-${formatMoney(item.amount)}` : formatMoney(item.amount);
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(item.isArrears ? '#92400E' : (item.isDiscount ? '#15803D' : textDark))
          .text(amtStr, 440, currentY + 6, { align: 'right', width: 105 });

        currentY += rowHeight;
      });

      // Total Due Highlight Bar
      currentY += 4;
      doc.rect(40, currentY, 515, 30).fill('#0F172A');

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#FFFFFF')
        .text('TOTAL AMOUNT PAYABLE', 50, currentY + 9);

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#38BDF8')
        .text(formatMoney(options.invoice.totalAmount), 350, currentY + 8, { align: 'right', width: 195 });

      currentY += 40;

      // -------------------------------------------------------------
      // 4. REGISTERED PAYMENT CHANNELS
      // -------------------------------------------------------------
      doc.rect(40, currentY, 515, 80).fillAndStroke('#F0FDF4', '#86EFAC');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#166534')
        .text('OFFICIAL REGISTERED PAYMENT CHANNELS', 50, currentY + 8);

      // M-Pesa Column
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(textDark)
        .text('M-Pesa Mobile Money:', 50, currentY + 24);

      const paybillText = options.landlordPaybill || '247247';
      const accountText = `Unit ${options.unitNumber || options.invoice.unitNumber || '101'}`;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(textMuted)
        .text(`Paybill Business No: ${paybillText}`, 50, currentY + 38)
        .text(`Account No: ${accountText}`, 50, currentY + 50);

      if (options.landlordTill) {
        doc.text(`Buy Goods Till No: ${options.landlordTill}`, 50, currentY + 62);
      }

      // Bank Column
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(textDark)
        .text('Bank Wire Transfer:', 305, currentY + 24);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(textMuted)
        .text(`Bank: ${options.bankName || 'Equity Bank Kenya'}`, 305, currentY + 38)
        .text(`A/C Name: ${options.accountName || options.companyName || options.landlordName || 'EstateMaster Rent'}`, 305, currentY + 50)
        .text(`A/C No: ${options.accountNumber || '0110293847561'}`, 305, currentY + 62);

      currentY += 92;

      // -------------------------------------------------------------
      // 5. OFFICIAL AUTHENTICATION FOOTER
      // -------------------------------------------------------------
      const footerY = Math.max(currentY, 730);
      doc
        .strokeColor(borderLine)
        .lineWidth(1)
        .moveTo(40, footerY)
        .lineTo(555, footerY)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(textDark)
        .text('ESTATEMASTER KENYA OFFICIAL INVOICE STATEMENT', 40, footerY + 8, { align: 'center', width: 515 });

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(textMuted)
        .text(
          `Document Serial: ${docSerial} • Timestamp: ${new Date().toISOString()} • Unit ${options.unitNumber || ''} (${options.propertyName || ''})`,
          40,
          footerY + 18,
          { align: 'center', width: 515 }
        )
        .text(
          'Please ensure prompt payment before the specified due date to avoid automated late fee assessments.',
          40,
          footerY + 28,
          { align: 'center', width: 515 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
