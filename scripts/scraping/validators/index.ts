/**
 * Validators Index
 *
 * Combines all validation layers and provides a unified validation pipeline.
 */

// Types
export {
  type ValidationSeverity,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type CombinedValidationResult,
  type ExtractedTranscriptData,
  type ExpectedTranscriptData,
  CONFIDENCE_CONFIG,
  calculateConfidence,
  determineAutoDecision,
} from './types';

// Layer 1: Extraction
export {
  validateExtraction,
  hasRequiredFields,
  calculateWordCount,
  type ExtractionValidationConfig,
} from './extraction';

// Layer 2: Semantic
export {
  validateSemantics,
  looksLikeTranscript,
  type SemanticValidationConfig,
} from './semantic';

// Layer 3: Cross-Reference
export {
  validateCrossReference,
  buildCrossReferenceFromTranscripts,
  canSkipCrossReference,
  type CrossReferenceData,
  type CrossReferenceConfig,
} from './crossReference';

import { type ExtractedTranscriptData, type ExpectedTranscriptData, type CombinedValidationResult } from './types';
import { calculateConfidence, determineAutoDecision } from './types';
import { validateExtraction, type ExtractionValidationConfig } from './extraction';
import { validateSemantics, type SemanticValidationConfig } from './semantic';
import { validateCrossReference, type CrossReferenceData, type CrossReferenceConfig, canSkipCrossReference } from './crossReference';

/**
 * Combined validation configuration
 */
export interface ValidationPipelineConfig {
  extraction?: ExtractionValidationConfig;
  semantic?: SemanticValidationConfig;
  crossReference?: CrossReferenceConfig;
  skipCrossReferenceIfEmpty?: boolean;
}

/**
 * Run full validation pipeline
 *
 * Executes all three validation layers and calculates confidence score.
 * Returns combined result with auto-decision.
 */
export function runValidationPipeline(
  extracted: ExtractedTranscriptData,
  expected: ExpectedTranscriptData,
  crossRef: CrossReferenceData,
  config: ValidationPipelineConfig = {}
): CombinedValidationResult {
  // Layer 1: Extraction validation
  const layer1 = validateExtraction(extracted, config.extraction);

  // Layer 2: Semantic validation
  const layer2 = validateSemantics(extracted, expected, config.semantic);

  // Layer 3: Cross-reference validation
  let layer3;
  if (config.skipCrossReferenceIfEmpty && canSkipCrossReference(crossRef)) {
    // Skip cross-reference if no data available
    layer3 = {
      passed: true,
      errors: [],
      warnings: [
        {
          field: 'crossReference',
          message: 'Cross-reference validation skipped (no reference data available)',
          severity: 'info' as const,
        },
      ],
      checksPerformed: ['skipped'],
    };
  } else {
    layer3 = validateCrossReference(extracted, crossRef, config.crossReference);
  }

  // Calculate confidence score
  const { score, hasCriticalFailure } = calculateConfidence([layer1, layer2, layer3]);

  // Determine auto decision
  const autoDecision = determineAutoDecision(score, hasCriticalFailure);

  // Collect reasons for the decision
  const reasons: string[] = [];

  if (hasCriticalFailure) {
    reasons.push('Critical validation failure detected');
  }

  if (!layer1.passed) {
    reasons.push('Extraction validation failed');
  }

  if (!layer2.passed) {
    reasons.push('Semantic validation failed');
  }

  if (!layer3.passed) {
    reasons.push('Cross-reference validation failed');
  }

  if (autoDecision === 'approve') {
    reasons.push(`Confidence score ${score}% >= 90% threshold`);
  } else if (autoDecision === 'review') {
    reasons.push(`Confidence score ${score}% requires human review (70-89%)`);
  } else {
    reasons.push(`Confidence score ${score}% below 70% threshold`);
  }

  return {
    layer1,
    layer2,
    layer3,
    confidence: score,
    autoDecision,
    reasons,
  };
}

/**
 * Quick validation check (Layer 1 only)
 *
 * Use for fast rejection of obviously bad data before
 * running full pipeline.
 */
export function quickValidate(extracted: ExtractedTranscriptData): {
  shouldContinue: boolean;
  reasons: string[];
} {
  const result = validateExtraction(extracted);

  const criticalErrors = result.errors.filter((e) => e.severity === 'critical');

  if (criticalErrors.length > 0) {
    return {
      shouldContinue: false,
      reasons: criticalErrors.map((e) => e.message),
    };
  }

  return {
    shouldContinue: true,
    reasons: [],
  };
}

/**
 * Format validation result for logging
 */
export function formatValidationResult(result: CombinedValidationResult): string {
  const lines: string[] = [];

  lines.push(`=== Validation Result ===`);
  lines.push(`Confidence: ${result.confidence}%`);
  lines.push(`Decision: ${result.autoDecision.toUpperCase()}`);
  lines.push(`Reasons: ${result.reasons.join('; ')}`);
  lines.push('');

  // Layer 1
  lines.push(`Layer 1 (Extraction): ${result.layer1.passed ? 'PASSED' : 'FAILED'}`);
  if (result.layer1.errors.length > 0) {
    for (const error of result.layer1.errors) {
      lines.push(`  [${error.severity}] ${error.field}: ${error.message}`);
    }
  }

  // Layer 2
  lines.push(`Layer 2 (Semantic): ${result.layer2.passed ? 'PASSED' : 'FAILED'}`);
  if (result.layer2.errors.length > 0) {
    for (const error of result.layer2.errors) {
      lines.push(`  [${error.severity}] ${error.field}: ${error.message}`);
    }
  }

  // Layer 3
  lines.push(`Layer 3 (Cross-Ref): ${result.layer3.passed ? 'PASSED' : 'FAILED'}`);
  if (result.layer3.errors.length > 0) {
    for (const error of result.layer3.errors) {
      lines.push(`  [${error.severity}] ${error.field}: ${error.message}`);
    }
  }

  return lines.join('\n');
}
