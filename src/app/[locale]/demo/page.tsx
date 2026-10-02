import {Dashboard} from '@/components/workspace-dashboard';
import {demoProjects} from '@/modules/projects/fixtures';
export default function Demo(){return <Dashboard initialProjects={demoProjects} demo timezone='Asia/Seoul' />;}