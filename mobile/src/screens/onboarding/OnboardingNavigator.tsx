import React from 'react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import Step1Welcome from './Step1Welcome';
import Step2Personal from './Step2Personal';
import Step3Goal from './Step3Goal';
import Step4Activity from './Step4Activity';
import Step5KcalGoal from './Step5KcalGoal';
import Step6Permission from './Step6Permission';
import Step7Finish from './Step7Finish';

export default function OnboardingNavigator() {
  const currentStep = useOnboardingStore((s) => s.currentStep);

  switch (currentStep) {
    case 1: return <Step1Welcome />;
    case 2: return <Step2Personal />;
    case 3: return <Step3Goal />;
    case 4: return <Step4Activity />;
    case 5: return <Step5KcalGoal />;
    case 6: return <Step6Permission />;
    case 7: return <Step7Finish />;
    default: return <Step1Welcome />;
  }
}
