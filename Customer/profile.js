document.addEventListener('DOMContentLoaded', () => {
  const menuItems = [...document.querySelectorAll('.menu-item')];
  const backButton = document.getElementById('profileBackBtn');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const pageTitle = document.querySelector('.page-header h1');
  const summaryName = document.querySelector('.summary-info h3');
  const identityName = document.querySelector('.identity-text h2');
  const identityEmail = document.querySelector('.identity-text p');

  const profileState = {
    fullName: 'Vlxx Capate',
    mobile: '+63 912 345 6789',
    email: 'vlxxcapate96@gmail.com',
    birthday: 'April 12, 1998',
    deliveryNotes: 'Ring the bell twice',
    preferredPayment: 'Cash on Delivery',
    address: {
      line1: 'San Roque, Tarlac City',
      line2: 'Barangay San Roque',
      line3: 'Phase 2, Lot 15, Villa del Sol'
    }
  };

  const updateProfileValues = () => {
    const fullNameEl = document.querySelector('[data-field="fullName"]');
    const mobileEl = document.querySelector('[data-field="mobile"]');
    const emailEl = document.querySelector('[data-field="email"]');
    const birthdayEl = document.querySelector('[data-field="birthday"]');
    const notesEl = document.querySelector('[data-field="deliveryNotes"]');
    const paymentEl = document.querySelector('[data-field="preferredPayment"]');
    const addressEls = document.querySelectorAll('[data-address]');

    if (fullNameEl) fullNameEl.textContent = profileState.fullName;
    if (mobileEl) mobileEl.textContent = profileState.mobile;
    if (emailEl) emailEl.textContent = profileState.email;
    if (birthdayEl) birthdayEl.textContent = profileState.birthday;
    if (notesEl) notesEl.textContent = profileState.deliveryNotes;
    if (paymentEl) paymentEl.textContent = profileState.preferredPayment;

    addressEls.forEach((el) => {
      const key = el.dataset.address;
      if (profileState.address[key] !== undefined) {
        el.textContent = profileState.address[key];
      }
    });

    if (summaryName) summaryName.textContent = profileState.fullName;
    if (identityName) identityName.textContent = profileState.fullName;
    if (identityEmail) identityEmail.textContent = profileState.email;
    if (pageTitle) pageTitle.textContent = 'My Profile';
  };

  const setActiveMenu = (activeItem) => {
    menuItems.forEach((item) => {
      item.classList.toggle('active', item === activeItem);
    });
  };

  const buildEditControls = () => {
    const fieldMap = {
      fullName: document.querySelector('[data-field="fullName"]'),
      mobile: document.querySelector('[data-field="mobile"]'),
      email: document.querySelector('[data-field="email"]'),
      birthday: document.querySelector('[data-field="birthday"]'),
      deliveryNotes: document.querySelector('[data-field="deliveryNotes"]'),
      preferredPayment: document.querySelector('[data-field="preferredPayment"]')
    };

    Object.entries(fieldMap).forEach(([key, valueEl]) => {
      if (!valueEl) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'profile-input';
      input.value = profileState[key];
      input.dataset.inputKey = key;
      valueEl.classList.add('is-editing');
      valueEl.insertAdjacentElement('afterend', input);
    });

    const addressBox = document.querySelector('.address-box');
    if (addressBox) {
      const addressLines = [...addressBox.querySelectorAll('[data-address]')];
      addressLines.forEach((line) => {
        const key = line.dataset.address;
        const textarea = document.createElement('textarea');
        textarea.className = 'profile-textarea';
        textarea.value = profileState.address[key];
        textarea.dataset.addressKey = key;
        line.style.display = 'none';
        line.insertAdjacentElement('afterend', textarea);
      });
    }
  };

  const removeEditControls = () => {
    document.querySelectorAll('.profile-input, .profile-textarea').forEach((el) => el.remove());
    document.querySelectorAll('[data-field]').forEach((el) => el.classList.remove('is-editing'));
    document.querySelectorAll('[data-address]').forEach((el) => {
      el.style.display = '';
    });
  };

  const saveProfileChanges = () => {
    const inputEls = [...document.querySelectorAll('.profile-input')];
    inputEls.forEach((input) => {
      const key = input.dataset.inputKey;
      if (key && profileState[key] !== undefined) {
        profileState[key] = input.value.trim() || profileState[key];
      }
    });

    const addressInputs = [...document.querySelectorAll('[data-address-key]')];
    addressInputs.forEach((input) => {
      const key = input.dataset.addressKey;
      if (profileState.address[key] !== undefined) {
        profileState.address[key] = input.value.trim() || profileState.address[key];
      }
    });

    removeEditControls();
    updateProfileValues();

    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
      headerActions.querySelectorAll('.secondary-btn').forEach((btn) => btn.remove());
      const activeEditBtn = document.getElementById('editProfileBtn');
      if (activeEditBtn) {
        activeEditBtn.textContent = 'Edit Profile';
      }
    }
  };

  const toggleEditMode = () => {
    const existingSaveBtn = document.querySelector('.save-btn');
    if (existingSaveBtn) {
      saveProfileChanges();
      return;
    }

    buildEditControls();

    if (editProfileBtn) {
      editProfileBtn.textContent = 'Save Changes';
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.classList.add('secondary-btn', 'cancel-btn');
    cancelBtn.className = 'secondary-btn';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.classList.add('secondary-btn', 'save-btn');
    saveBtn.textContent = 'Save';

    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
      headerActions.appendChild(cancelBtn);
      headerActions.appendChild(saveBtn);
    }

    cancelBtn.addEventListener('click', () => {
      removeEditControls();
      const actions = document.querySelector('.header-actions');
      if (actions) {
        actions.querySelectorAll('.secondary-btn').forEach((btn) => btn.remove());
      }
      if (editProfileBtn) {
        editProfileBtn.textContent = 'Edit Profile';
      }
      updateProfileValues();
    });

    saveBtn.addEventListener('click', saveProfileChanges);
  };

  editProfileBtn.addEventListener('click', toggleEditMode);

  backButton.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  });

  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      if (item.classList.contains('logout')) {
        const shouldExit = window.confirm('Are you sure you want to log out?');
        if (shouldExit) {
          window.location.href = '../login.html';
        }
        return;
      }

      setActiveMenu(item);

      const label = item.textContent.trim();
      if (label.includes('My Orders')) {
        window.location.href = 'my orders.html';
      }
    });
  });

  updateProfileValues();
});
