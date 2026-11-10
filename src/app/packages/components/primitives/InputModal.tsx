import React, { useState, useRef, useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloseButton } from './CloseButton';
import { Button } from './button';
import { dialogOverlayMotion, useDialogWindowVariants } from './dialogMotion';
import { useFocusTrap } from './useFocusTrap';
import { t } from '../../../i18n';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  placeholder?: string | undefined;
  defaultValue?: string | undefined;
  onConfirm: (value: string) => void;
  validation?: ((value: string) => string | null) | undefined;
  /** Names the field for screen readers (else the dialog's title does); the placeholder too when none is given. */
  label?: string | undefined;
  /** The confirm button's words, where "Confirm" says less than the action. */
  confirmLabel?: string | undefined;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  title,
  placeholder = '',
  defaultValue = '',
  onConfirm,
  validation,
  label,
  confirmLabel
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  useFocusTrap(windowRef, isOpen);
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError(null);
      // Focus and select all text when modal opens
      window.setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    const trimmedValue = value.trim();
    
    if (!trimmedValue) {
      setError(t('common.valueEmpty'));
      return;
    }

    if (validation) {
      const validationError = validation(trimmedValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(trimmedValue);
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div {...dialogOverlayMotion} className="atlas-modal-overlay" onClick={handleCancel}>
          <motion.div
            ref={windowRef}
            className="atlas-modal atlas-input-modal"
            variants={windowVariants}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="atlas-modal-header">
              <h3 id={titleId}>{title}</h3>
              <CloseButton onClick={handleCancel} />
            </div>
        
            <div className="atlas-modal-body">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || label}
                {...(label ? { 'aria-label': label } : { 'aria-labelledby': titleId })}
                aria-invalid={error !== null || undefined}
                {...(error && { 'aria-describedby': errorId })}
                className="atlas-input"
              />
              {error && <div id={errorId} className="atlas-input-error" role="alert">{error}</div>}
            </div>

            <div className="atlas-modal-footer">
              <Button variant="outline" size="sm" onClick={handleCancel}>{t('common.cancel')}</Button>
              <Button variant="default" size="sm" disabled={value.trim() === ''} onClick={handleConfirm}>{confirmLabel ?? t('common.confirm')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InputModal;
