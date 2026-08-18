/**
 * Navigates back one step in the browser's session history.
 */
function goBack() {
  // Standard and reliable way to use the browser's history stack.
  window.history.back();
}

/**
 * Checks if there is any history available (i.e., if the user didn't 
 * start on this page) and disables the button if not.
 */
document.addEventListener('DOMContentLoaded', () => {
  const backButton = document.getElementById('backButton');
  
  // Check for history. If the length is 1, they likely started on this page.
  if (backButton && window.history.length <= 1) {
    backButton.disabled = true;
    backButton.textContent = '🏠 Home Page';
    // Optional: You could also hide the button completely.
    // backButton.style.display = 'none';
  }
});



const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');

function toggleSidebar() {
    // Toggles the 'active' class on sidebar and 'shifted' on the main container
    sidebar.classList.toggle('active');
    if (mainContent) {
        mainContent.classList.toggle('shifted');
    }
}

// Optional: Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('active') && 
        !sidebar.contains(e.target) && 
        !e.target.closest('.menu-toggle')) {
        toggleSidebar();
    }
});
