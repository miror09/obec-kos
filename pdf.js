'use strict';

// PDF sa vytvorí priamo v prehliadači z rovnakých údajov ako tabuľky.
// Funguje aj offline: bez PHP, databázy a externých knižníc.
(() => {
  const downloadButton = document.getElementById('pdf-download');
  if (!downloadButton) return;

  const PAGE_WIDTH = 800;
  const PAGE_HEIGHT = 1132; // Pomer strán A4.
  const LEFT = 52;
  const TABLE_WIDTH = 696;
  const encoder = new TextEncoder();

  function makePage(data) {
    const scale = 2.5; // Vysoké rozlíšenie pri tlači A4.
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PAGE_WIDTH * scale);
    canvas.height = Math.round(PAGE_HEIGHT * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Prehliadač nepodporuje vytváranie PDF.');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.textBaseline = 'middle';

    const text = (label, x, y, options = {}) => {
      const { size = 14, bold = false, align = 'left', color = '#111111' } = options;
      ctx.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(String(label), x, y);
    };
    const line = (x1, y1, x2, y2, color = '#b8bec5', width = 0.75) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const table = (y, columns, headings, rows, rowHeight) => {
      const headHeight = 32;
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(LEFT, y, TABLE_WIDTH, headHeight);
      const xs = [LEFT];
      columns.forEach(w => xs.push(xs[xs.length - 1] + w));
      const endY = y + headHeight + rows.length * rowHeight;
      xs.forEach(x => line(x, y, x, endY));
      line(LEFT, y, LEFT + TABLE_WIDTH, y);
      line(LEFT, y + headHeight, LEFT + TABLE_WIDTH, y + headHeight);
      rows.forEach((row, r) => line(LEFT, y + headHeight + (r + 1) * rowHeight, LEFT + TABLE_WIDTH, y + headHeight + (r + 1) * rowHeight));
      headings.forEach((value, i) => {
        text(value, i === 1 ? xs[i] + 12 : (xs[i] + xs[i + 1]) / 2, y + 16, {
          size: 12, bold: true, align: i === 1 ? 'left' : 'center'
        });
      });
      rows.forEach((row, r) => row.forEach((value, i) => {
        const yRow = y + headHeight + r * rowHeight + rowHeight / 2;
        text(value, i === 1 ? xs[i] + 12 : (xs[i] + xs[i + 1]) / 2, yRow, {
          size: 12.5, align: i === 1 ? 'left' : 'center'
        });
      }));
      return endY;
    };

    text('OBEC KOŠ', LEFT, 68, { size: 15, bold: true });
    text('Výsledky komunálnych volieb', LEFT, 110, { size: 26, bold: true });
    text('24. októbra 2026', LEFT, 141, { size: 14 });
    line(LEFT, 163, LEFT + TABLE_WIDTH, 163, '#4b5563', 1);
    const turnout = pct(data.turnout.voted, data.turnout.eligible);
    text('Účasť voličov:', LEFT, 192, { size: 13, bold: true });
    text(pctText(turnout), LEFT + 117, 192, { size: 13 });

    text('Voľba starostu', LEFT, 235, { size: 18, bold: true });
    const mayors = orderByVotes(data.mayor);
    const mayorVotes = valid(data.turnout.mayorValidBallots)
      ? data.turnout.mayorValidBallots
      : isComplete(mayors) ? mayors.reduce((sum, c) => sum + c.votes, 0) : null;
    const mayorRows = mayors.map((c, i) => [
      String(i + 1), c.name, votesText(c.votes), pctText(pct(c.votes, mayorVotes)),
      stateLabel(winner(c, data.mayor, 1))
    ]);
    const mayorBottom = table(252, [48, 310, 96, 112, 130],
      ['Por.', 'Meno a priezvisko', 'Počet hlasov', 'Podiel', 'Výsledok'], mayorRows, 35);

    const councilHeadingY = mayorBottom + 42;
    text('Voľby do obecného zastupiteľstva', LEFT, councilHeadingY, { size: 18, bold: true });
    const council = orderByVotes(data.council);
    const councilRows = council.map((c, i) => [
      String(i + 1), c.name, votesText(c.votes), stateLabel(winner(c, data.council, data.councilSeats))
    ]);
    const councilBottom = table(councilHeadingY + 20, [48, 378, 126, 144],
      ['Por.', 'Meno a priezvisko', 'Počet hlasov', 'Výsledok'], councilRows, 29);

    if (councilBottom > PAGE_HEIGHT - 54) {
      throw new Error('Pre túto tabuľku je potrebných viac strán PDF.');
    }
    line(LEFT, PAGE_HEIGHT - 46, LEFT + TABLE_WIDTH, PAGE_HEIGHT - 46, '#d1d5db');
    text('Obec Koš', LEFT, PAGE_HEIGHT - 30, { size: 11, color: '#555555' });
    text('1 / 1', LEFT + TABLE_WIDTH, PAGE_HEIGHT - 30, { size: 11, color: '#555555', align: 'right' });
    return canvas;
  }

  // Jednostránkový PDF dokument A4 s obrázkom tabuľky. Všetky slovenské
  // znaky zostanú správne vykreslené aj bez dodatočných písiem či knižníc.
  function canvasToPdf(canvas) {
    const jpeg = atob(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
    const pixels = Uint8Array.from(jpeg, char => char.charCodeAt(0));
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const push = part => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      length += bytes.byteLength;
    };
    const object = (id, content) => {
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      content();
      push('\nendobj\n');
    };
    push('%PDF-1.4\n');
    object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    object(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    object(3, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'));
    object(4, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pixels.byteLength} >>\nstream\n`);
      push(pixels);
      push('\nendstream');
    });
    object(5, () => {
      const stream = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
      push(`<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n`);
      push(stream);
      push('endstream');
    });
    const xrefAt = length;
    push('xref\n0 6\n0000000000 65535 f \n');
    for (let id = 1; id <= 5; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  downloadButton.addEventListener('click', () => {
    try {
      const pdf = canvasToPdf(makePage(window.VOLBY_DATA));
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Kos-vysledky-volieb-2026.pdf';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('PDF sa nepodarilo vytvoriť:', error);
      alert('PDF sa nepodarilo vytvoriť. Skúste stránku obnoviť.');
    }
  });
})();
