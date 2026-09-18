# Student Tracker & Analytics — Android App & GitHub Pages

A standalone, completely offline-capable student tracking and class performance system designed for single-teacher or institutional use.

This repository is configured with a unified **GitHub Actions** workflow that simultaneously:
1. **Compiles a standalone offline Android APK** (`.apk`) that can be installed on any Android phone.
2. **Deploys the web application to GitHub Pages** at zero cost.

---

## 📱 How to Get Your Android .apk File via GitHub Actions

### Step 1: Push This Code to Your GitHub Repository
1. Export this repository or download the ZIP from AI Studio.
2. Push your project code to your GitHub repository on branch `main` or `master`:
   ```bash
   git add .
   git commit -m "Configure offline Android APK build and GitHub Pages deployment"
   git push -u origin main
   ```

### Step 2: GitHub Actions Automated Build
1. On GitHub, navigate to your repository and click on the **Actions** tab.
2. You will see a workflow running named **"Build Android APK & Deploy GitHub Pages"**.
3. Click on the active workflow run to watch the build progress.
   - Job 1: **Build Offline Android APK** (installs JDK 17, packages assets, and generates the APK)
   - Job 2: **Deploy GitHub Pages** (publishes the web version to GitHub Pages)

### Step 3: Download the .apk File
1. When the workflow completes (green checkmark, typically 2–3 minutes):
2. Click on the completed workflow run.
3. Scroll down to the **Artifacts** section at the bottom of the page.
4. Click on **`StudentTracker-Android-APK`** to download the ZIP file containing your `student-tracker.apk`.
5. Extract the ZIP file on your computer or directly on your phone.

### Step 4: Install the .apk on Your Android Phone
1. Transfer `student-tracker.apk` to your phone via USB, Google Drive, WhatsApp, or email (or download it directly on your phone's browser from GitHub).
2. Tap on `student-tracker.apk`.
3. If prompted with *"For your security, your phone is not allowed to install unknown apps from this source"*:
   - Tap **Settings** and toggle on **Allow from this source**.
4. Tap **Install**, then tap **Open**.
5. The app launches immediately and runs **100% offline**, with no internet connection or server required!

---

## 🌐 How to Enable GitHub Pages

1. In your GitHub repository, open **Settings** > **Pages** (under "Code and automation").
2. Under **Build and deployment**:
   - Change **Source** to **GitHub Actions**.
3. When the GitHub Actions workflow runs, it automatically provisions and publishes your site.
4. Your site will be live at: `https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/`.

---

## 🛠️ Offline Capabilities & Features Included
- **Zero API Dependency**: Works in airplane mode or with no connectivity.
- **Roster & Section Filtering**: Add students, filter by section, search by roll number or phone.
- **Attendance Register**: Daily sessions with bulk status marks (Present / Late / Absent / Excused).
- **Exam Marks Tracking**: Record exam scores with real-time percentages and grade badges.
- **Communication Logbook**: Direct phone calling (`tel:`) and call history tracking with parent/student tags.
- **Teacher's Hub**: Class-wide analytics, average score trends, attendance flags, and performance distributions.
- **Offline PDF Generation**: Generates comprehensive single-student and multi-student PDF dossiers directly using offline jsPDF.
- **Data Backup & Restore**: JSON database export/import and CSV spreadsheet download.
