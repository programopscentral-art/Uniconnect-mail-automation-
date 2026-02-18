# Product Requirement Document (PRD): UniConnect

## 1. Executive Summary
**UniConnect** is a comprehensive, enterprise-grade platform designed to automate and streamline communication and academic processes for educational institutions. It serves as a centralized hub for managing email campaigns, generating academic assessments, tracking communication tasks, and ensuring academic integrity.

## 2. Product Objectives
- **Efficiency**: Replace manual, repetitive tasks (like individual emailing and question paper formatting) with automated workflows.
- **Scale**: Enable administrators to manage thousands of students and multiple university partners simultaneously.
- **Consistency**: Ensure institutional branding and formatting standards across all outgoing communications and academic documents.
- **Intelligence**: Leverage AI-driven tools for plagiarism detection and content analysis.

---

## 3. Target Audience
- **Program Managers (NxtWave/Partner Institutions)**: Oversee large-scale student communication.
- **Academic Content Creators**: Responsible for generating and formatting assessments.
- **Administrators**: Manage platform users, roles, and university data.
- **Students**: Recipients of automated institutional communications and assessments.

---

## 4. Key Functional Modules

### A. Intelligent Mail Automation
The core system for outbound communication.
- **Campaign Management**: Create, schedule, and track bulk email campaigns.
- **Google Integration**: Direct integration with Gmail/Google Workspace via OAuth for authentic sending.
- **Template System**: Dynamic HTML/Svelte-based templates with variable injection for personalization.
- **Mail Logs & Tracking**: Real-time monitoring of sent emails, delivery status, and bounce rates.
- **Recipient Optimization**: Intelligent deduplication and filtering to prevent spamming.

### B. Academic Assessment Engine (Design Studio)
A specialized tool for creating institutional-standard question papers.
- **Dynamic Templates**: Pre-configured layouts for specific universities (e.g., Crescent, Chaitanya University, VGU).
- **Figma Integration**: Import pixel-perfect designs directly from Figma to be used as assessment frames.
- **Paper Structure Metadata**: Control over MCQ partitioning, mark distribution (Part A/B), and total marks.
- **Export Capabilities**: Generate high-fidelity PDFs ready for printing or digital distribution.

### C. Communication Task & Day Planning
A CRM-lite layer for managing manual follow-ups.
- **Task Tracking**: Assign and track manual communication tasks (calls, direct emails) for specific cohorts.
- **Day Plan**: A prioritized view for administrators to manage their daily outreach and academic deadlines.
- **Notification System**: Native desktop popups and in-app alerts for critical communication tasks.

### D. Entity Management
- **University Management**: Profile tracking for multiple institutions with individual branding and permission sets.
- **Student Database**: Central repository for student data, linked to specific campaigns and academic records.

---

## 5. Technical Architecture
- **Frontend**: SvelteKit (Svelte 5) with Tailwind CSS for a premium, responsive UI.
- **Backend/API**: SvelteKit Server-Side Routes (TypeScript).
- **Background Processing**: BullMQ with Redis for handling high-volume email queues and heavy PDF generation tasks.
- **Database**: PostgreSQL (via Supabase) for robust relational data management.
- **Authentication**: Firebase Auth combined with Google OAuth for enterprise SSO.
- **Infrastructure & Deployment**: Hosted on **Railway** for automated CI/CD, high availability, and seamless scaling of worker nodes.

---

## 6. User Experience (UX) Principles
- **Premium Aesthetics**: Dark mode support, glassmorphism elements, and smooth micro-animations.
- **Responsive Design**: Fully functional across desktop, tablet, and mobile devices.
- **Action-Oriented Dashboards**: High-level summaries with direct "quick action" buttons for frequent tasks.

---

## 7. Future Roadmap & AI Integration
While the core platform focuses on execution, higher-level AI features are currently in development or available via **AI Agent Assistance**:
- **Automated Layout Reconstruction**: Direct UI integration for converting PDFs to editable Design Studio templates.
- **AI-Powered Question Generation**: Generating academic content based on syllabus inputs.
- **Communication Intelligence**: Predictive analysis for student engagement and response rates.
- **Plagiarism & Integrity Suite**: Advanced scanning for academic honesty.
