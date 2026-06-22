/**
 * Permission Engine
 * Evaluates AI permissions and computes risk classification
 */

class PermissionEngine {
  constructor() {
    this.weights = {
      privacy: 0.35,
      terms: 0.20,
      https: 0.10,
      metadata: 0.10,
      formatting: 0.10,
      schema: 0.05,
      duplicates: 0.10
    };
  }

  /**
   * Evaluate permissions given detected legal pages and parsed policy
   * detectedLegal: {privacy, terms, cookie, refund}
   * parsedPolicy: object with Allow-Training, Allow-Embedding, Require-Attribution etc.
   * validation: validation layer results {https_ok, metadataScore, formattingScore, schemaPresent, duplicateTitleCount}
   */
  evaluate(detectedLegal = {}, parsedPolicy = {}, validation = {}) {
    const permissions = {
      allow_summary: true,
      allow_quotation: true,
      allow_embedding: true,
      allow_training: false,
      require_attribution: true,
      risk_score: 0,
      risk_label: 'High',
      rationale: []
    };

    // Default require attribution to true unless explicitly false
    if (parsedPolicy && (parsedPolicy['Require-Attribution'] === 'No' || parsedPolicy['Require-Attribution'] === false)) {
      permissions.require_attribution = false;
    } else {
      permissions.require_attribution = true;
    }

    // Training & embedding require privacy policy
    if (detectedLegal && detectedLegal.privacy) {
      // honor explicit policy flags if present
      permissions.allow_training = this.parseFlag(parsedPolicy, 'Allow-Training', false);
      permissions.allow_embedding = this.parseFlag(parsedPolicy, 'Allow-Embedding', true);
    } else {
      permissions.allow_training = false;
      permissions.allow_embedding = false;
      permissions.rationale.push('Missing privacy policy → training and embedding disabled');
    }

    // If terms missing, add rationale and will affect risk
    if (!detectedLegal || !detectedLegal.terms) {
      permissions.rationale.push('Missing terms page → legal score and risk impacted');
    }

    // If policy claims allow-training but legal pages weak, override
    if (this.parseFlag(parsedPolicy, 'Allow-Training', false) && (!detectedLegal || !detectedLegal.privacy)) {
      permissions.allow_training = false;
      permissions.rationale.push('Policy allows training but privacy page missing → training disabled');
    }

    // New explicit risk rules as requested
    const canonicalCoverage = Number((validation && validation.canonicalCoverage) || 0);
    const metaCoverage = Number((validation && validation.metaDescriptionCoverage) || 0);
    const duplicateTitles = Number((validation && validation.duplicateTitleCount) || 0);

    const mediumConditions = [];
    if (canonicalCoverage < 0.5) mediumConditions.push('canonicalCoverage<50%');
    if (metaCoverage < 0.5) mediumConditions.push('metaDescriptionCoverage<50%');
    if (duplicateTitles > 20) mediumConditions.push('duplicateTitles>20');

    const severeConditions = [];
    if (canonicalCoverage === 0) severeConditions.push('canonicalCoverage==0');
    if (metaCoverage === 0) severeConditions.push('metaDescriptionCoverage==0');
    if (duplicateTitles > 30) severeConditions.push('duplicateTitles>30');

    // Determine label
    if (severeConditions.length >= 1 || mediumConditions.length >= 2) {
      permissions.risk_label = 'High';
    } else if (mediumConditions.length >= 1) {
      permissions.risk_label = 'Medium';
    } else {
      permissions.risk_label = 'Low';
    }

    permissions.risk_score = (permissions.risk_label === 'Low') ? 0.1 : (permissions.risk_label === 'Medium' ? 0.5 : 0.9);
    // rationale additions
    permissions.risk_rationale = [...(permissions.rationale || [])];
    if (mediumConditions.length) permissions.risk_rationale.push(...mediumConditions);
    if (severeConditions.length) permissions.risk_rationale.push(...severeConditions);

    return permissions;
  }

  parseFlag(policy, key, defaultValue) {
    if (!policy) return defaultValue;
    const v = policy[key];
    if (v === undefined || v === null) return defaultValue;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /^(yes|true|1)$/i.test(v);
    return Boolean(v);
  }
}

module.exports = new PermissionEngine();
