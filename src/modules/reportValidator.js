/**
 * Report Validator
 * Ensures category scores and final score consistency
 */

class ReportValidator {
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  validateAuditReport(report) {
    const categories = ['sitemap','robots','classification','policy','metadata','legal','formatting'];
    const errors = [];

    if (!report || !report.scoreData || !report.scoreData.breakdown) {
      return { valid: false, errors: ['Missing scoreData or breakdown'], report };
    }

    const bd = report.scoreData.breakdown;
    // clamp categories
    categories.forEach(cat => {
      let v = Number(bd[cat]);
      if (isNaN(v)) { bd[cat] = 0; errors.push(`${cat} score missing, set to 0`); return; }
      v = Math.round(v);
      if (v < 0 || v > 10) {
        bd[cat] = this.clamp(v, 0, 10);
        errors.push(`${cat} score out of range, clamped to ${bd[cat]}`);
      } else {
        bd[cat] = v;
      }
    });

    // recompute final score and compare
    const weights = report.scoreData.weights || { sitemap:10, robots:10, classification:20, policy:25, metadata:15, legal:10, formatting:10 };
    // convert weights to fractions if in percent
    const normWeights = {};
    const totalW = Object.values(weights).reduce((s,w)=>s+Number(w||0),0) || 100;
    Object.entries(weights).forEach(([k,w]) => { normWeights[k] = Number(w)/totalW; });

    let fraction = 0;
    categories.forEach(cat => { fraction += (bd[cat]/10) * (normWeights[cat] || 0); });
    const computedFinal = Math.round(this.clamp(fraction*100, 0, 100));

    if (report.scoreData.score !== computedFinal) {
      errors.push(`Final score mismatch: computed ${computedFinal} vs reported ${report.scoreData.score}. Updating.`);
      report.scoreData.score = computedFinal;
    }

    // Check consistency between validation and metadata/formatting
    if (report.validation) {
      if (typeof report.validation.formattingScore === 'number' && report.scoreData.breakdown.formatting !== report.validation.formattingScore) {
        errors.push('Formatting score mismatch: breakdown vs validation');
        report.scoreData.breakdown.formatting = report.validation.formattingScore;
      }
      if (typeof report.validation.metaDescriptionCoverage !== 'undefined' && report.validation.metaDescriptionCoverage === 0 && report.scoreData.breakdown.metadata > 0) {
        errors.push('Metadata score > 0 while meta description coverage = 0');
      }
      if (typeof report.validation.canonicalCoverage !== 'undefined' && report.validation.canonicalCoverage === 0 && report.scoreData.breakdown.metadata > 0) {
        errors.push('Metadata score > 0 while canonical coverage = 0');
      }
    }

    return { valid: errors.length === 0, errors, report };
  }
}

module.exports = new ReportValidator();
