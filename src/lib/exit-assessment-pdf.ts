/**
 * PDF export that matches `exit-assessment-preview.html`: renders the same DOM
 * (styles in exit-assessment-print.css) via html2canvas + jsPDF.
 * Dynamic import avoids SSR (`self is not defined` during Next prerender).
 */
export async function downloadExitAssessmentPdfFromElement(
  element: HTMLElement,
  fileName: string,
): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js');
  const base = fileName.replace(/\.pdf$/i, '').trim() || 'exit-assessment-results';
  const options = {
    margin: [0.4, 0.4, 0.4, 0.4],
    filename: `${base}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
    },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] },
  };
  await html2pdf().set(options as never).from(element).save();
}
