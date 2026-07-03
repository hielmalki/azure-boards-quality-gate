import { Loader2, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

type StepStatus = 'pending' | 'active' | 'done';

type Step = {
  label: string;
  status: StepStatus;
};

const ANALYSIS_STEPS: string[] = [
  'Applying rulesets',
  'Analyzing ticket',
  'Running checks',
  'Preparing results',
];

const STEP_DURATIONS = [700, 1100, 900, 600];

interface AnalysisTransitionProps {
  onComplete: () => void;
}

export function AnalysisTransition({ onComplete }: AnalysisTransitionProps) {
  const [steps, setSteps] = useState<Step[]>(
    ANALYSIS_STEPS.map(label => ({ label, status: 'pending' }))
  );
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Activate first step immediately
    setSteps(prev =>
      prev.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }))
    );
  }, []);

  useEffect(() => {
    if (currentStep >= ANALYSIS_STEPS.length) {
      // All done — brief pause then complete
      const t = setTimeout(onComplete, 400);
      return () => clearTimeout(t);
    }

    const duration = STEP_DURATIONS[currentStep] ?? 800;
    const t = setTimeout(() => {
      setSteps(prev =>
        prev.map((s, i) => {
          if (i === currentStep) return { ...s, status: 'done' };
          if (i === currentStep + 1) return { ...s, status: 'active' };
          return s;
        })
      );
      setCurrentStep(c => c + 1);
    }, duration);

    return () => clearTimeout(t);
  }, [currentStep, onComplete]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          {/* Header — matches existing KI-Agent pattern */}
          <div className="flex items-center gap-2 mb-4">
            <Loader2
              size={14}
              className={`text-blue-600 ${currentStep < ANALYSIS_STEPS.length ? 'animate-spin' : ''}`}
            />
            <span className="text-sm text-gray-900">AI agent working…</span>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Your rulesets are being applied and the ticket is being analyzed.
          </p>

          {/* Step progress — same as FixFlow */}
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {step.status === 'done' ? (
                  <Check size={12} className="text-emerald-600" />
                ) : step.status === 'active' ? (
                  <Loader2 size={12} className="text-blue-600 animate-spin" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-300" />
                )}
                <span
                  className={`text-xs ${
                    step.status === 'done'
                      ? 'text-gray-500'
                      : step.status === 'active'
                        ? 'text-gray-900'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
