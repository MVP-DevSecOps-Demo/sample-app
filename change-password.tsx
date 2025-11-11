'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EyeIcon, EyeOffIcon, KeyIcon, CheckCircleIcon, AlertCircleIcon, LoaderIcon, ShieldIcon, LockIcon } from 'lucide-react'
import { AnimatedCard } from '@/components/ui/animated-card'

export function ChangePassword() {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  const [passwordVisible, setPasswordVisible] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  })

  const [passwordStrength, setPasswordStrength] = useState(0)
  const [passwordFeedback, setPasswordFeedback] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const togglePasswordVisibility = (field: keyof typeof passwordVisible) => {
    setPasswordVisible({
      ...passwordVisible,
      [field]: !passwordVisible[field]
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value
    })

    // Calculate password strength when new password changes
    if (name === 'newPassword') {
      const strength = calculatePasswordStrength(value)
      setPasswordStrength(strength)
      
      // Set feedback based on strength
      if (value === '') {
        setPasswordFeedback('')
      } else if (strength < 2) {
        setPasswordFeedback('Weak password')
      } else if (strength < 4) {
        setPasswordFeedback('Medium password')
      } else {
        setPasswordFeedback('Strong password')
      }
    }
  }

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0
    
    if (password.length >= 8) strength += 1
    if (/[A-Z]/.test(password)) strength += 1
    if (/[a-z]/.test(password)) strength += 1 
    if (/[0-9]/.test(password)) strength += 1
    if (/[^A-Za-z0-9]/.test(password)) strength += 1
    
    return strength
  }

  const getStrengthBarColor = (index: number) => {
    if (passwordStrength === 0) return 'bg-gray-200 dark:bg-gray-700'
    
    if (passwordStrength >= index + 1) {
      if (passwordStrength <= 2) return 'bg-red-500'
      if (passwordStrength <= 4) return 'bg-yellow-500'
      return 'bg-green-500'
    }
    
    return 'bg-gray-200 dark:bg-gray-700'
  }

  const getStrengthTextColor = () => {
    if (passwordStrength === 0) return 'text-gray-500'
    if (passwordStrength <= 2) return 'text-red-500'
    if (passwordStrength <= 4) return 'text-yellow-500'
    return 'text-green-500'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setFormStatus('error')
      setErrorMessage('New passwords do not match')
      return
    }

    // Validate password strength
    if (passwordStrength < 3) {
      setFormStatus('error')
      setErrorMessage('Please create a stronger password')
      return
    }

    setIsLoading(true)
    setFormStatus('idle')

    try {
      // Mock API call - replace with your actual API call
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Simulate success
      setFormStatus('success')
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setPasswordStrength(0)
      setPasswordFeedback('')
    } catch {
      setFormStatus('error')
      setErrorMessage('Failed to change password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Password criteria check
  const passwordCriteria = [
    { id: 'length', label: 'At least 8 characters', met: formData.newPassword.length >= 8 },
    { id: 'uppercase', label: 'At least 1 uppercase letter', met: /[A-Z]/.test(formData.newPassword) },
    { id: 'lowercase', label: 'At least 1 lowercase letter', met: /[a-z]/.test(formData.newPassword) },
    { id: 'number', label: 'At least 1 number', met: /[0-9]/.test(formData.newPassword) },
    { id: 'special', label: 'At least 1 special character', met: /[^A-Za-z0-9]/.test(formData.newPassword) }
  ]

  return (
    <div className="bg-[#FFF] dark:bg-[#00053A] p-10 sm:p-12 md:p-14">
      <AnimatedCard className="max-w-md mx-auto border-0 shadow-none bg-transparent dark:bg-transparent" animationType="fade">
        <div className="space-y-8">
          <div className="space-y-2 text-center">
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-700 flex items-center justify-center mb-8 shadow-lg shadow-orange-500/20 dark:shadow-orange-600/20 transform hover:scale-105 transition-transform duration-300">
                <KeyIcon className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Change Password</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-3">
              Update your password to keep your account secure. Strong passwords help protect your information.
            </p>
          </div>

          {formStatus === 'success' && (
            <div className="p-5 bg-green-50 dark:bg-green-900/20 flex items-center gap-4 text-green-700 dark:text-green-300 animate-fade-in-down">
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-500 dark:text-green-400" />
              <p className="text-sm font-medium">Your password has been successfully updated!</p>
            </div>
          )}

          {formStatus === 'error' && (
            <div className="p-5 bg-red-50 dark:bg-red-900/20 flex items-center gap-4 text-red-700 dark:text-red-300 animate-fade-in-down">
              <AlertCircleIcon className="h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-sm font-medium">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-gray-700 dark:text-gray-300 font-medium">Current Password</Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockIcon className="h-5 w-5 text-gray-400 group-focus-within:text-orange-500 transition-colors duration-200" />
                  </div>
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type={passwordVisible.currentPassword ? "text" : "password"}
                    placeholder="Enter your current password"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    className="pl-10 pr-10 border-0 rounded-none bg-gray-50/80 dark:bg-gray-900/40 focus:ring-0 transition-all duration-200 py-2.5"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors duration-200"
                    onClick={() => togglePasswordVisibility('currentPassword')}
                  >
                    {passwordVisible.currentPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-700 dark:text-gray-300 font-medium">New Password</Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldIcon className="h-5 w-5 text-gray-400 group-focus-within:text-orange-500 transition-colors duration-200" />
                  </div>
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type={passwordVisible.newPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    className="pl-10 pr-10 border-0 rounded-none bg-gray-50/80 dark:bg-gray-900/40 focus:ring-0 transition-all duration-200 py-2.5"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors duration-200"
                    onClick={() => togglePasswordVisibility('newPassword')}
                  >
                    {passwordVisible.newPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* Password strength indicator */}
                {formData.newPassword && (
                  <div className="mt-4 space-y-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((index) => (
                        <div
                          key={index}
                          className={`h-2.5 flex-1 rounded-full transition-all duration-300 ${getStrengthBarColor(index)}`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${getStrengthTextColor()}`}>
                      {passwordFeedback}
                    </p>
                  </div>
                )}

                {/* Password criteria checklist */}
                <div className="mt-4 p-4 bg-gray-50/50 dark:bg-gray-900/30">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Password requirements:</p>
                  <ul className="space-y-1">
                    {passwordCriteria.map((criteria) => (
                      <li 
                        key={criteria.id} 
                        className={`text-xs flex items-center transition-colors duration-200 pb-1 ${
                          formData.newPassword 
                            ? criteria.met 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-gray-500 dark:text-gray-400' 
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {criteria.met 
                          ? <CheckCircleIcon className="h-3.5 w-3.5 mr-2 text-green-500 dark:text-green-400" /> 
                          : <div className="h-3.5 w-3.5 mr-2 rounded-full bg-gray-200 dark:bg-gray-700" />
                        }
                        {criteria.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-gray-300 font-medium">Confirm New Password</Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldIcon className="h-5 w-5 text-gray-400 group-focus-within:text-orange-500 transition-colors duration-200" />
                  </div>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={passwordVisible.confirmPassword ? "text" : "password"}
                    placeholder="Confirm your new password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={`pl-10 pr-10 border-0 rounded-none bg-gray-50/80 dark:bg-gray-900/40 focus:ring-0 transition-all duration-200 py-2.5 ${
                      formData.confirmPassword && formData.newPassword && formData.confirmPassword !== formData.newPassword
                        ? 'bg-red-50/50 dark:bg-red-900/20'
                        : ''
                    }`}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors duration-200"
                    onClick={() => togglePasswordVisibility('confirmPassword')}
                  >
                    {passwordVisible.confirmPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {formData.confirmPassword && formData.newPassword && formData.confirmPassword !== formData.newPassword && (
                  <p className="text-xs text-red-500 mt-1 animate-pulse">Passwords do not match</p>
                )}
              </div>
            </div>

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium py-3 text-base transform hover:-translate-y-0.5 transition-all duration-200"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    <span>Updating Password...</span>
                  </div>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          </form>

          <div className="text-center pt-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Having trouble? <a href="#" className="text-orange-500 hover:text-orange-600 font-medium underline-offset-2 hover:underline transition-all duration-200">Contact Support</a>
            </p>
          </div>
        </div>
      </AnimatedCard>
    </div>
  )
}
