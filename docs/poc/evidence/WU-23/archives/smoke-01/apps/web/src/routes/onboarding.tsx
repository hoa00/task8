import {createFileRoute} from '@tanstack/react-router';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/onboarding')({validateSearch:input=>({step:Number.isInteger(Number(input.step))&&Number(input.step)>=0&&Number(input.step)<=5?Number(input.step):0}),component:PendingPage});
