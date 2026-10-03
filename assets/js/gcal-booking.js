(function() {
  window.addEventListener('load', function() {
    calendar.schedulingButton.load({
      url: 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1LpG9E-ewaL7K8UFwHCuPzzsUYkePPP5WiNRzOV4qe9B9jSFvb5JT6oZLIUOWi7PsbaJrhRjsc?gv=true',
      color: '#000091',
      label: 'Réserver un rendez-vous',
      target: document.getElementById('gcal-booking-btn'),
    });
  });
})();
