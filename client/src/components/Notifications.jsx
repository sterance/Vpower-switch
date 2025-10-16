import { Snackbar, Alert } from '@mui/material'

function Notifications({ open, onClose, message, severity = 'info', autoHideDuration = 4000 }) {
  return (
    <Snackbar open={open} autoHideDuration={autoHideDuration} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={onClose} severity={severity} variant="filled" sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  )
}

export default Notifications